import { Kysely, sql } from 'kysely';
import { DB } from '../db/types.js';
import { createKyselyDatabaseClient } from '../db/index.js';
import { WateringFrequencyRow } from '../schemas/report.js';

export const createReportConnector = (database: Kysely<DB>) => {
  const getWateringFrequency = async (
    gardenId: string,
    from: string,
    to: string,
  ): Promise<WateringFrequencyRow[]> => {
    const rows = await database
      .selectFrom('plant_metric')
      .innerJoin('plant', 'plant.id', 'plant_metric.plantId')
      .where('plant.gardenId', '=', gardenId)
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

  const getPlantsAddedCount = async (gardenId: string, since: string): Promise<number> => {
    const result = await database
      .selectFrom('plant')
      .where('gardenId', '=', gardenId)
      .where('createdAt', '>=', since)
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirstOrThrow()
      .catch((error) => {
        throw new Error('Failed to fetch plants added count', { cause: error });
      });

    return Number(result.count);
  };

  const getTotalPlantCount = async (gardenId: string): Promise<number> => {
    const result = await database
      .selectFrom('plant')
      .where('gardenId', '=', gardenId)
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirstOrThrow()
      .catch((error) => {
        throw new Error('Failed to fetch total plant count', { cause: error });
      });

    return Number(result.count);
  };

  return {
    getWateringFrequency,
    getPlantsAddedCount,
    getTotalPlantCount,
  };
};

export const reportConnector = createReportConnector(createKyselyDatabaseClient());
export type ReportConnector = ReturnType<typeof createReportConnector>;
