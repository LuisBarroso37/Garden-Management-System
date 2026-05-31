import { Kysely, Selectable } from 'kysely';
import { DB, PlantMetric } from '../db/types.js';
import { z } from 'zod/v4';
import { createKyselyDatabaseClient } from '../db/index.js';
import { CreatedResult, createdResultSchema } from '../schemas/created-result.js';
import { dayjs } from '../utils/dayjs.js';
import {
  connectorPlantMetricSchema,
  CreatePlantMetricInput,
  createPlantMetricSchema,
} from '../schemas/plant-metrics.js';

export const createPlantMetricConnector = (database: Kysely<DB>) => {
  const getLatestPlantMetricsForIds = async (
    plantIds: string[],
  ): Promise<Selectable<PlantMetric>[]> => {
    return database
      .selectFrom('plant_metric')
      .where('plantId', 'in', plantIds)
      .distinctOn('plantId')
      .orderBy('plantId')
      .orderBy('createdAt', 'desc')
      .selectAll()
      .execute()
      .catch((error) => {
        throw new Error(`Failed to fetch latest plant metrics for plants`, {
          cause: error,
        });
      });
  };

  const createPlantMetric = async (input: CreatePlantMetricInput): Promise<CreatedResult> => {
    const createdPlantResult = await database
      .insertInto('plant_metric')
      .values({
        plantId: input.plantId,
        currentHumidityLevel: input.currentHumidityLevel,
        ...(input.lastIrrigationStartTime && {
          lastIrrigationStartTime: input.lastIrrigationStartTime,
        }),
        ...(input.lastIrrigationEndTime && { lastIrrigationEndTime: input.lastIrrigationEndTime }),
        createdAt: dayjs.utc().format('YYYY-MM-DDTHH:mm:ss[Z]'),
      })
      .returning('id')
      .executeTakeFirst()
      .catch((error: unknown) => {
        throw new Error(`Failed to create plant metric for plant [${input.plantId}]`, {
          cause: error,
        });
      });

    if (!createdPlantResult) {
      throw new Error(`Failed to create plant metric for plant [${input.plantId}]`);
    }

    return { id: createdPlantResult.id };
  };

  return {
    getLatestPlantMetricsForIds: z
      .function({ input: [z.array(z.uuid())], output: connectorPlantMetricSchema.array() })
      .implementAsync(getLatestPlantMetricsForIds),
    createPlantMetric: z
      .function({ input: [createPlantMetricSchema], output: createdResultSchema })
      .implementAsync(createPlantMetric),
    withTransaction: (trx: Kysely<DB>) => createPlantMetricConnector(trx),
  };
};

export const plantMetricConnector = createPlantMetricConnector(createKyselyDatabaseClient());
export type PlantMetricConnector = ReturnType<typeof createPlantMetricConnector>;
