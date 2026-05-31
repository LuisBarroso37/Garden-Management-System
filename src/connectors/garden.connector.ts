import { Kysely, Selectable } from 'kysely';
import { DB, Garden } from '../db/types.js';
import {
  connectorGardenSchema,
  CreateGardenInput,
  createGardenSchema,
  UpdateGardenInput,
  updateGardenSchema,
} from '../schemas/gardens.js';
import { z } from 'zod/v4';
import { createKyselyDatabaseClient } from '../db/index.js';
import { dayjs } from '../utils/dayjs.js';
import { CreatedResult, createdResultSchema } from '../schemas/created-result.js';

export class GardenNotFoundError extends Error {
  constructor(userId: string, gardenId: string, cause?: ErrorOptions) {
    super(`Garden [${gardenId}] not found for user [${userId}]`, cause);
  }
}

export const createGardenConnector = (database: Kysely<DB>) => {
  const getGarden = async (
    userId: string,
    gardenId: string,
  ): Promise<Selectable<Garden> | undefined> => {
    const garden = await database
      .selectFrom('garden')
      .where('userId', '=', userId)
      .where('id', '=', gardenId)
      .selectAll()
      .executeTakeFirst()
      .catch((error) => {
        throw new Error(`Failed to fetch garden for user [${userId}]`, { cause: error });
      });

    if (!garden) {
      return;
    }

    return garden;
  };

  const getGardens = async (userId: string): Promise<Selectable<Garden>[]> => {
    return database
      .selectFrom('garden')
      .where('userId', '=', userId)
      .selectAll()
      .execute()
      .catch((error) => {
        throw new Error(`Failed to fetch garden for user [${userId}]`, { cause: error });
      });
  };

  const createGarden = async (userId: string, input: CreateGardenInput): Promise<CreatedResult> => {
    const now = dayjs.utc().format('YYYY-MM-DDTHH:mm:ss[Z]');

    const createdFollowUpPlanResult = await database
      .insertInto('garden')
      .values({
        name: input.name,
        totalSurfaceArea: input.totalSurfaceArea,
        ...(input.locationDescription && { locationDescription: input.locationDescription }),
        ...(input.targetHumidityLevel && { targetHumidityLevel: input.targetHumidityLevel }),
        userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning('id')
      .executeTakeFirst()
      .catch((error: unknown) => {
        throw new Error(`Failed to create garden record for user [${userId}]`, {
          cause: error,
        });
      });

    if (!createdFollowUpPlanResult) {
      throw new Error(`Failed to create garden record for user [${userId}]`);
    }

    return { id: createdFollowUpPlanResult.id };
  };

  const updateGarden = async (
    userId: string,
    gardenId: string,
    input: UpdateGardenInput,
  ): Promise<Selectable<Garden>> => {
    const updatedGarden = await database
      .updateTable('garden')
      .set({
        ...(input.name && { name: input.name }),
        ...(input.totalSurfaceArea && { totalSurfaceArea: input.totalSurfaceArea }),
        ...(input.locationDescription && { locationDescription: input.locationDescription }),
        ...(input.targetHumidityLevel && { targetHumidityLevel: input.targetHumidityLevel }),
        updatedAt: dayjs.utc().format('YYYY-MM-DDTHH:mm:ss[Z]'),
      })
      .where('id', '=', gardenId)
      .where('userId', '=', userId)
      .returningAll()
      .executeTakeFirst()
      .catch((error) => {
        throw new Error(`Failed to update garden [${gardenId}] for user [${userId}]`, {
          cause: error,
        });
      });

    if (!updatedGarden) {
      throw new GardenNotFoundError(userId, gardenId);
    }

    return updatedGarden;
  };

  const deleteGarden = async (userId: string, gardenId: string): Promise<void> => {
    await database
      .deleteFrom('garden')
      .where('id', '=', gardenId)
      .where('userId', '=', userId)
      .execute()
      .catch((error) => {
        throw new Error(`Failed to delete garden [${gardenId}] for user [${userId}]`, {
          cause: error,
        });
      });
  };

  return {
    getGarden: z
      .function({ input: [z.uuid(), z.uuid()], output: connectorGardenSchema.optional() })
      .implementAsync(getGarden),
    getGardens: z
      .function({ input: [z.uuid()], output: connectorGardenSchema.array() })
      .implementAsync(getGardens),
    createGarden: z
      .function({ input: [z.uuid(), createGardenSchema], output: createdResultSchema })
      .implementAsync(createGarden),
    updateGarden: z
      .function({ input: [z.uuid(), z.uuid(), updateGardenSchema], output: connectorGardenSchema })
      .implementAsync(updateGarden),
    deleteGarden: z
      .function({ input: [z.uuid(), z.uuid()], output: z.void() })
      .implementAsync(deleteGarden),
  };
};

export const gardenConnector = createGardenConnector(createKyselyDatabaseClient());
export type GardenConnector = ReturnType<typeof createGardenConnector>;
