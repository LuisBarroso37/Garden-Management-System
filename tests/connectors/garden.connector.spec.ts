import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Kysely } from 'kysely';
import type { DB } from '../../src/db/types.js';
import {
  createGardenConnector,
  GardenNotFoundError,
} from '../../src/connectors/garden.connector.js';
import { startTestDatabase } from '../setup/start-postgres-database.js';

describe('GardenConnector', () => {
  let databaseSetup: Awaited<ReturnType<typeof startTestDatabase>>;
  let database: Kysely<DB>;
  let gardenConnector: ReturnType<typeof createGardenConnector>;

  const userId = '550e8400-e29b-41d4-a716-446655440000';
  const otherUserId = '660e8400-e29b-41d4-a716-446655440000';

  beforeAll(async () => {
    databaseSetup = await startTestDatabase();
    database = databaseSetup.database;
    gardenConnector = createGardenConnector(database);

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
        {
          id: otherUserId,
          firstName: 'Other',
          lastName: 'User',
          age: 25,
          email: 'other@example.com',
          passwordHash: 'hashed',
        },
      ])
      .execute();
  });

  beforeEach(async () => {
    await databaseSetup.truncate('garden');
  });

  afterAll(async () => {
    await databaseSetup.teardown();
  });

  describe('createGarden', () => {
    it('should successfully create a garden', async () => {
      const result = await gardenConnector.createGarden(userId, {
        name: 'My Backyard Garden',
        totalSurfaceArea: 50.5,
        locationDescription: 'Backyard',
      });

      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('getGarden', () => {
    it('should return a garden by id', async () => {
      const { id } = await gardenConnector.createGarden(userId, {
        name: 'Patio Garden',
        totalSurfaceArea: 20,
        locationDescription: 'Patio',
      });

      const garden = await gardenConnector.getGarden(userId, id);

      expect(garden).toStrictEqual({
        id,
        userId,
        name: 'Patio Garden',
        locationDescription: 'Patio',
        targetHumidityLevel: null,
        totalSurfaceArea: 20,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('should return undefined if garden does not exist', async () => {
      const garden = await gardenConnector.getGarden(
        userId,
        '00000000-0000-0000-0000-000000000000',
      );

      expect(garden).toBeUndefined();
    });

    it('should not return a garden belonging to another user', async () => {
      const { id } = await gardenConnector.createGarden(otherUserId, {
        name: 'Other Garden',
        totalSurfaceArea: 10,
        locationDescription: 'Front yard',
      });

      const garden = await gardenConnector.getGarden(userId, id);

      expect(garden).toBeUndefined();
    });
  });

  describe('getGardens', () => {
    it('should return all gardens for a user', async () => {
      await gardenConnector.createGarden(userId, {
        name: 'Garden A',
        totalSurfaceArea: 30,
        locationDescription: 'Backyard',
      });
      await gardenConnector.createGarden(userId, {
        name: 'Garden B',
        totalSurfaceArea: 15,
        locationDescription: 'Patio',
      });

      const gardens = await gardenConnector.getGardens(userId);

      expect(gardens).toHaveLength(2);
      expect(gardens.map((g) => g.name)).toContain('Garden A');
      expect(gardens.map((g) => g.name)).toContain('Garden B');
    });

    it('should return empty array if user has no gardens', async () => {
      const gardens = await gardenConnector.getGardens(userId);

      expect(gardens).toEqual([]);
    });

    it('should not return gardens belonging to other users', async () => {
      await gardenConnector.createGarden(otherUserId, {
        name: 'Other Garden',
        totalSurfaceArea: 10,
        locationDescription: 'Roof',
      });

      const gardens = await gardenConnector.getGardens(userId);

      expect(gardens).toEqual([]);
    });
  });

  describe('updateGarden', () => {
    it('should update a garden and return the updated record', async () => {
      const { id } = await gardenConnector.createGarden(userId, {
        name: 'Old Name',
        totalSurfaceArea: 25,
        locationDescription: 'Backyard',
      });

      const updated = await gardenConnector.updateGarden(userId, id, {
        name: 'New Name',
      });

      expect(updated.name).toBe('New Name');
      expect(updated.locationDescription).toBe('Backyard');
    });

    it('should throw GardenNotFoundError when garden does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await expect(gardenConnector.updateGarden(userId, fakeId, { name: 'Nope' })).rejects.toThrow(
        GardenNotFoundError,
      );
    });

    it('should throw GardenNotFoundError when garden belongs to another user', async () => {
      const { id } = await gardenConnector.createGarden(otherUserId, {
        name: 'Not Mine',
        totalSurfaceArea: 10,
        locationDescription: 'Somewhere',
      });

      await expect(gardenConnector.updateGarden(userId, id, { name: 'Stolen' })).rejects.toThrow(
        GardenNotFoundError,
      );
    });
  });

  describe('deleteGarden', () => {
    it('should delete an existing garden', async () => {
      const { id } = await gardenConnector.createGarden(userId, {
        name: 'To Delete',
        totalSurfaceArea: 5,
        locationDescription: 'Side yard',
      });

      await gardenConnector.deleteGarden(userId, id);

      const garden = await gardenConnector.getGarden(userId, id);
      expect(garden).toBeUndefined();
    });

    it('should not throw when garden does not exist', async () => {
      await expect(
        gardenConnector.deleteGarden(userId, '00000000-0000-0000-0000-000000000000'),
      ).resolves.not.toThrow();
    });
  });
});
