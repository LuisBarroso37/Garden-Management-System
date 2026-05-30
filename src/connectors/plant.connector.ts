import { Kysely, Selectable } from 'kysely';
import { DB, Plant } from '../db/types';
import { z } from 'zod/v4';
import { createKyselyDatabaseClient } from '../db';
import {
  CreatePlantInput,
  createPlantSchema,
  plantSchema,
  UpdatePlantInput,
  updatePlantSchema,
} from '../schemas/plants';
import { CreatedResult, createdResultSchema } from '../schemas/created-result';
import { dayjs } from '../utils/dayjs.js';

export class PlantNotFoundError extends Error {
  constructor(gardenId: string, plantId: string, cause?: ErrorOptions) {
    super(`Plant [${plantId}] not found in garden [${gardenId}]`, cause);
  }
}

export const createPlantConnector = (database: Kysely<DB>) => {
  const getPlant = async (
    gardenId: string,
    plantId: string,
  ): Promise<Selectable<Plant> | undefined> => {
    const plant = await database
      .selectFrom('plant')
      .where('id', '=', plantId)
      .where('gardenId', '=', gardenId)
      .selectAll()
      .executeTakeFirst()
      .catch((error) => {
        throw new Error(`Failed to fetch plant with id [${plantId}] in garden [${gardenId}]`, {
          cause: error,
        });
      });

    if (!plant) {
      return;
    }

    return plant;
  };

  const getPlants = async (gardenId: string): Promise<Selectable<Plant>[]> => {
    return database
      .selectFrom('plant')
      .where('gardenId', '=', gardenId)
      .selectAll()
      .execute()
      .catch((error) => {
        throw new Error(`Failed to fetch plants for garden [${gardenId}]`, { cause: error });
      });
  };

  const createPlant = async (gardenId: string, input: CreatePlantInput): Promise<CreatedResult> => {
    const now = dayjs.utc().format('YYYY-MM-DDTHH:mm:ss[Z]');

    const createdPlantResult = await database
      .insertInto('plant')
      .values({
        name: input.name,
        species: input.species,
        plantType: input.plantType,
        plantationDate: input.plantationDate,
        surfaceAreaRequired: input.surfaceAreaRequired,
        idealHumidityLevel: input.idealHumidityLevel,
        gardenId,
        createdAt: now,
        updatedAt: now,
      })
      .returning('id')
      .executeTakeFirst()
      .catch((error: unknown) => {
        throw new Error(`Failed to create plant record for garden [${gardenId}]`, {
          cause: error,
        });
      });

    if (!createdPlantResult) {
      throw new Error(`Failed to create plant record for garden [${gardenId}]`);
    }

    return { id: createdPlantResult.id };
  };

  const updatePlant = async (
    gardenId: string,
    plantId: string,
    input: UpdatePlantInput,
  ): Promise<Selectable<Plant>> => {
    const updatedPlant = await database
      .updateTable('plant')
      .set({
        ...(input.name && { name: input.name }),
        ...(input.plantType && { plantType: input.plantType }),
        ...(input.plantationDate && { plantationDate: input.plantationDate }),
        ...(input.species && { species: input.species }),
        ...(input.surfaceAreaRequired && { surfaceAreaRequired: input.surfaceAreaRequired }),
        ...(input.idealHumidityLevel && { idealHumidityLevel: input.idealHumidityLevel }),
        updatedAt: dayjs.utc().format('YYYY-MM-DDTHH:mm:ss[Z]'),
      })
      .where('id', '=', plantId)
      .where('gardenId', '=', gardenId)
      .returningAll()
      .executeTakeFirst()
      .catch((error) => {
        throw new Error(`Failed to update plant with id [${plantId}] in garden [${gardenId}]`, {
          cause: error,
        });
      });

    if (!updatedPlant) {
      throw new PlantNotFoundError(gardenId, plantId);
    }

    return updatedPlant;
  };

  const deletePlant = async (gardenId: string, plantId: string): Promise<void> => {
    await database
      .deleteFrom('plant')
      .where('id', '=', plantId)
      .where('gardenId', '=', gardenId)
      .execute()
      .catch((error) => {
        throw new Error(`Failed to delete plant with id [${plantId}] in garden [${gardenId}]`, {
          cause: error,
        });
      });
  };

  return {
    getPlant: z
      .function({ input: [z.uuid(), z.uuid()], output: plantSchema.optional() })
      .implementAsync(getPlant),
    getPlants: z
      .function({ input: [z.uuid()], output: plantSchema.array() })
      .implementAsync(getPlants),
    createPlant: z
      .function({ input: [z.uuid(), createPlantSchema], output: createdResultSchema })
      .implementAsync(createPlant),
    updatePlant: z
      .function({ input: [z.uuid(), z.uuid(), updatePlantSchema], output: plantSchema })
      .implementAsync(updatePlant),
    deletePlant: z
      .function({ input: [z.uuid(), z.uuid()], output: z.void() })
      .implementAsync(deletePlant),
  };
};

export const plantConnector = createPlantConnector(createKyselyDatabaseClient());
export type PlantConnector = ReturnType<typeof createPlantConnector>;
