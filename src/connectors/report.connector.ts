import { Kysely, sql } from 'kysely';
import { DB } from '../db/types.js';
import { createKyselyDatabaseClient } from '../db/index.js';
import { wateringFrequencySchema, WateringFrequencyRow } from '../schemas/report.js';
import { z } from 'zod/v4';

export const createReportConnector = (database: Kysely<DB>) => {
  const getWateringFrequency = async (
    userId: string,
    gardenId: string,
    from: string,
    to: string,
  ): Promise<WateringFrequencyRow[]> => {
    const rows = await database
      .selectFrom('plant_metric')
      .innerJoin('plant', 'plant.id', 'plant_metric.plantId')
      .innerJoin('garden', 'garden.id', 'plant.gardenId')
      .where('plant.gardenId', '=', gardenId)
      .where('garden.userId', '=', userId)
      .where('plant_metric.lastIrrigationStartTime', '>=', from)
      .where('plant_metric.lastIrrigationStartTime', '<=', to)
      .select([
        'plant.id as plantId',
        'plant.name as plantName',
        sql<number>`count(distinct plant_metric."lastIrrigationStartTime")`.as('wateringCount'),
      ])
      .groupBy(['plant.id', 'plant.name'])
      .execute()
      .catch((error) => {
        throw new Error('Failed to fetch watering frequency', { cause: error });
      });

    return rows.map((row) => ({
      plantId: row.plantId,
      plantName: row.plantName,
      wateringCount: Number(row.wateringCount),
    }));
  };

  const getPlantsAddedCount = async (
    userId: string,
    gardenId: string,
    since: string,
  ): Promise<number> => {
    const result = await database
      .selectFrom('plant')
      .innerJoin('garden', 'garden.id', 'plant.gardenId')
      .where('plant.gardenId', '=', gardenId)
      .where('garden.userId', '=', userId)
      .where('plant.createdAt', '>=', since)
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirstOrThrow()
      .catch((error) => {
        throw new Error('Failed to fetch plants added count', { cause: error });
      });

    return Number(result.count);
  };

  const getTotalPlantCount = async (userId: string, gardenId: string): Promise<number> => {
    const result = await database
      .selectFrom('plant')
      .innerJoin('garden', 'garden.id', 'plant.gardenId')
      .where('plant.gardenId', '=', gardenId)
      .where('garden.userId', '=', userId)
      .where('plant.deletedAt', 'is', null)
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirstOrThrow()
      .catch((error) => {
        throw new Error('Failed to fetch total plant count', { cause: error });
      });

    return Number(result.count);
  };

  const getPlantsDeletedCount = async (
    userId: string,
    gardenId: string,
    since: string,
  ): Promise<number> => {
    const result = await database
      .selectFrom('plant')
      .innerJoin('garden', 'garden.id', 'plant.gardenId')
      .where('plant.gardenId', '=', gardenId)
      .where('garden.userId', '=', userId)
      .where('plant.deletedAt', 'is not', null)
      .where('plant.deletedAt', '>=', since)
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirstOrThrow()
      .catch((error) => {
        throw new Error('Failed to fetch plants deleted count', { cause: error });
      });

    return Number(result.count);
  };

  return {
    getWateringFrequency: z
      .function({
        input: [z.uuid(), z.uuid(), z.iso.datetime(), z.iso.datetime()],
        output: wateringFrequencySchema.array(),
      })
      .implementAsync(getWateringFrequency),
    getPlantsAddedCount: z
      .function({ input: [z.uuid(), z.uuid(), z.iso.datetime()], output: z.number() })
      .implementAsync(getPlantsAddedCount),
    getTotalPlantCount: z
      .function({ input: [z.uuid(), z.uuid()], output: z.number() })
      .implementAsync(getTotalPlantCount),
    getPlantsDeletedCount: z
      .function({ input: [z.uuid(), z.uuid(), z.iso.datetime()], output: z.number() })
      .implementAsync(getPlantsDeletedCount),
  };
};

export const reportConnector = createReportConnector(createKyselyDatabaseClient());
export type ReportConnector = ReturnType<typeof createReportConnector>;
