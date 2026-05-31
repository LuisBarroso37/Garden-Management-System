import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Kysely } from 'kysely';
import type { DB } from '../../src/db/types.js';
import { createPlantConnector, PlantNotFoundError } from '../../src/connectors/plant.connector.js';
import { startTestDatabase } from '../setup/start-postgres-database.js';

describe('PlantConnector', () => {
  let databaseSetup: Awaited<ReturnType<typeof startTestDatabase>>;
  let database: Kysely<DB>;
  let plantConnector: ReturnType<typeof createPlantConnector>;

  const userId = '550e8400-e29b-41d4-a716-446655440000';
  const gardenId1 = '660e8400-e29b-41d4-a716-446655440000';
  const gardenId2 = '770e8400-e29b-41d4-a716-446655440000';

  beforeAll(async () => {
    databaseSetup = await startTestDatabase();
    database = databaseSetup.database;
    plantConnector = createPlantConnector(database);

    await database
      .insertInto('user')
      .values([
        {
          id: userId,
          firstName: 'Test',
          lastName: 'User',
          age: 30,
          email: 'test@example.com',
          passwordHash: 'hashed',
        },
      ])
      .execute();

    await database
      .insertInto('garden')
      .values([
        {
          id: gardenId1,
          name: 'Backyard Garden',
          totalSurfaceArea: 30,
          locationDescription: 'Backyard',
          userId,
        },
      ])
      .execute();
    await database
      .insertInto('garden')
      .values([
        {
          id: gardenId2,
          name: 'Frontyard Garden',
          totalSurfaceArea: 50,
          locationDescription: 'Frontyard',
          userId,
        },
      ])
      .execute();
  });

  beforeEach(async () => {
    await databaseSetup.truncate('plant');
  });

  afterAll(async () => {
    await databaseSetup.teardown();
  });

  describe('createPlant', () => {
    it('should successfully create a plant', async () => {
      const result = await plantConnector.createPlant(gardenId1, {
        name: 'Tomato',
        species: 'Solanum lycopersicum',
        plantType: 'vegetable',
        plantationDate: '2025-03-15T10:00:00Z',
        surfaceAreaRequired: 2.5,
        idealHumidityLevel: 60,
      });

      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('getPlant', () => {
    it('should return a plant by id', async () => {
      const { id } = await plantConnector.createPlant(gardenId1, {
        name: 'Patio Plant',
        species: 'Solanum lycopersicum',
        plantType: 'vegetable',
        plantationDate: '2025-03-15T10:00:00Z',
        surfaceAreaRequired: 2.5,
        idealHumidityLevel: 60,
      });

      const plant = await plantConnector.getPlant(userId, gardenId1, id);

      expect(plant).toStrictEqual({
        id,
        gardenId: gardenId1,
        name: 'Patio Plant',
        species: 'Solanum lycopersicum',
        plantType: 'vegetable',
        plantationDate: '2025-03-15T10:00:00Z',
        surfaceAreaRequired: 2.5,
        idealHumidityLevel: 60,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('should return undefined if plant does not exist', async () => {
      const plant = await plantConnector.getPlant(
        userId,
        gardenId1,
        '00000000-0000-0000-0000-000000000000',
      );

      expect(plant).toBeUndefined();
    });

    it('should not return a plant belonging to another garden', async () => {
      const { id } = await plantConnector.createPlant(gardenId2, {
        name: 'Other Plant',
        species: 'Solanum lycopersicum',
        plantType: 'vegetable',
        plantationDate: '2025-03-15T10:00:00Z',
        surfaceAreaRequired: 2.5,
        idealHumidityLevel: 60,
      });

      const plant = await plantConnector.getPlant(userId, gardenId1, id);

      expect(plant).toBeUndefined();
    });
  });

  describe('getPlants', () => {
    it('should return all plants for a garden', async () => {
      await plantConnector.createPlant(gardenId1, {
        name: 'Plant A',
        species: 'Solanum lycopersicum',
        plantType: 'vegetable',
        plantationDate: '2025-03-15T10:00:00Z',
        surfaceAreaRequired: 2.5,
        idealHumidityLevel: 60,
      });
      await plantConnector.createPlant(gardenId1, {
        name: 'Flower 1',
        species: 'Skeletus arvensis',
        plantType: 'flower',
        plantationDate: '2025-03-15T10:00:00Z',
        surfaceAreaRequired: 4.5,
        idealHumidityLevel: 80,
      });

      const plants = await plantConnector.getPlants(userId, gardenId1);

      expect(plants).toHaveLength(2);
      expect(plants.map((p) => p.name)).toContain('Plant A');
      expect(plants.map((p) => p.name)).toContain('Flower 1');
    });

    it('should return empty array if garden has no plants', async () => {
      const plants = await plantConnector.getPlants(userId, gardenId1);

      expect(plants).toEqual([]);
    });

    it('should not return plants belonging to other gardens', async () => {
      await plantConnector.createPlant(gardenId2, {
        name: 'Other Garden Plant',
        species: 'Solanum lycopersicum',
        plantType: 'vegetable',
        plantationDate: '2025-03-15T10:00:00Z',
        surfaceAreaRequired: 2.5,
        idealHumidityLevel: 60,
      });

      const plants = await plantConnector.getPlants(userId, gardenId1);

      expect(plants).toEqual([]);
    });
  });

  describe('updatePlant', () => {
    it('should update a plant and return the updated record', async () => {
      const { id } = await plantConnector.createPlant(gardenId1, {
        name: 'Old Name',
        species: 'Solanum lycopersicum',
        plantType: 'vegetable',
        plantationDate: '2025-03-15T10:00:00Z',
        surfaceAreaRequired: 2.5,
        idealHumidityLevel: 60,
      });

      const updated = await plantConnector.updatePlant(userId, gardenId1, id, {
        name: 'New Name',
      });

      expect(updated.name).toBe('New Name');
      expect(updated.species).toBe('Solanum lycopersicum');
    });

    it('should throw PlantNotFoundError when plant does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await expect(
        plantConnector.updatePlant(userId, gardenId1, fakeId, { name: 'Nope' }),
      ).rejects.toThrow(PlantNotFoundError);
    });

    it('should throw PlantNotFoundError when plant belongs to another garden', async () => {
      const { id } = await plantConnector.createPlant(gardenId2, {
        name: 'Not Mine',
        species: 'Solanum lycopersicum',
        plantType: 'vegetable',
        plantationDate: '2025-03-15T10:00:00Z',
        surfaceAreaRequired: 2.5,
        idealHumidityLevel: 60,
      });

      await expect(
        plantConnector.updatePlant(userId, gardenId1, id, { name: 'Stolen' }),
      ).rejects.toThrow(PlantNotFoundError);
    });
  });

  describe('deletePlant', () => {
    it('should soft-delete a plant (not returned by queries but still in DB)', async () => {
      const { id } = await plantConnector.createPlant(gardenId1, {
        name: 'To Delete',
        species: 'Solanum lycopersicum',
        plantType: 'vegetable',
        plantationDate: '2025-03-15T10:00:00Z',
        surfaceAreaRequired: 2.5,
        idealHumidityLevel: 60,
      });

      await plantConnector.deletePlant(userId, gardenId1, id);

      const plant = await plantConnector.getPlant(userId, gardenId1, id);
      expect(plant).toBeUndefined();

      const row = await database
        .selectFrom('plant')
        .where('id', '=', id)
        .selectAll()
        .executeTakeFirst();
      expect(row).toBeDefined();
      expect(row!.deletedAt).not.toBeNull();
    });

    it('should not throw when plant does not exist', async () => {
      await expect(
        plantConnector.deletePlant(userId, gardenId1, '00000000-0000-0000-0000-000000000000'),
      ).resolves.not.toThrow();
    });
  });
});
