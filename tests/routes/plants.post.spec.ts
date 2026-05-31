import { describe, it, expect, beforeAll, afterAll, type Mocked } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createPlantRoutes } from '../../src/routes/plants.js';
import type { PlantConnector } from '../../src/connectors/plant.connector.js';
import type { GardenConnector } from '../../src/connectors/garden.connector.js';
import type { PlantMetricConnector } from '../../src/connectors/plant-metric.connector.js';
import {
  createMockPlantConnector,
  createMockGardenConnector,
  createMockPlantMetricConnector,
  createMockDatabase,
  authHeaders,
} from '../setup/setup-mocks.js';
import { createTestApp } from '../setup/create-test-app.js';

const gardenId = '550e8400-e29b-41d4-a716-446655440000';
const plantId = '660e8400-e29b-41d4-a716-446655440001';

const validBody = {
  name: 'Tomato',
  species: 'Solanum lycopersicum',
  plantType: 'vegetable' as const,
  plantationDate: '2025-03-15T10:00:00Z',
  surfaceAreaRequired: 2.5,
  idealHumidityLevel: 60,
};

const mockGarden = {
  id: gardenId,
  userId: '770e8400-e29b-41d4-a716-446655440000',
  name: 'Test Garden',
  totalSurfaceArea: 100,
  locationDescription: null,
  targetHumidityLevel: null,
  createdAt: '2025-03-15T10:00:00Z',
  updatedAt: '2025-03-15T10:00:00Z',
};

describe('POST /api/gardens/:gardenId/plants', () => {
  let plantConnector: Mocked<PlantConnector>;
  let gardenConnector: Mocked<GardenConnector>;
  let plantMetricConnector: Mocked<PlantMetricConnector>;
  let txPlantConnector: Mocked<PlantConnector>;
  let txPlantMetricConnector: Mocked<PlantMetricConnector>;
  let app: FastifyInstance;

  beforeAll(async () => {
    plantConnector = createMockPlantConnector();
    gardenConnector = createMockGardenConnector();
    plantMetricConnector = createMockPlantMetricConnector();
    const database = createMockDatabase();

    txPlantConnector = createMockPlantConnector();
    txPlantMetricConnector = createMockPlantMetricConnector();

    gardenConnector.getGarden.mockResolvedValue(mockGarden);
    plantConnector.withTransaction.mockReturnValue(txPlantConnector);
    plantMetricConnector.withTransaction.mockReturnValue(txPlantMetricConnector);

    app = await createTestApp([
      {
        plugin: createPlantRoutes(plantConnector, gardenConnector, plantMetricConnector, database),
        prefix: '/api/gardens/:gardenId/plants',
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create a plant and return 201 with the id', async () => {
    txPlantConnector.createPlant.mockResolvedValue({ id: plantId });
    txPlantMetricConnector.createPlantMetric.mockResolvedValue({ id: 'metric-id' });

    const response = await app.inject({
      method: 'POST',
      url: `/api/gardens/${gardenId}/plants`,
      headers: authHeaders(),
      payload: validBody,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: plantId });
    expect(txPlantConnector.createPlant).toHaveBeenCalledWith(gardenId, validBody);
    expect(txPlantMetricConnector.createPlantMetric).toHaveBeenCalledWith({
      plantId,
      currentHumidityLevel: 50,
    });
  });

  it('should return 404 when the garden does not exist', async () => {
    gardenConnector.getGarden.mockResolvedValueOnce(undefined);

    const response = await app.inject({
      method: 'POST',
      url: `/api/gardens/${gardenId}/plants`,
      headers: authHeaders(),
      payload: validBody,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      errorType: 'NOT_FOUND',
      message: 'Garden not found',
    });
  });

  it('should return 400 when there is not enough surface area', async () => {
    gardenConnector.getGarden.mockResolvedValueOnce({
      ...mockGarden,
      totalSurfaceArea: 5,
    });
    plantConnector.getPlants.mockResolvedValueOnce([
      {
        id: '880e8400-e29b-41d4-a716-446655440000',
        gardenId,
        name: 'Existing Plant',
        species: 'Some species',
        plantType: 'vegetable',
        plantationDate: '2025-03-15T10:00:00Z',
        surfaceAreaRequired: 4,
        idealHumidityLevel: 60,
        createdAt: '2025-03-15T10:00:00Z',
        updatedAt: '2025-03-15T10:00:00Z',
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: `/api/gardens/${gardenId}/plants`,
      headers: authHeaders(),
      payload: { ...validBody, surfaceAreaRequired: 2 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      errorType: 'INSUFFICIENT_SURFACE_AREA',
      message: 'Not enough surface area in the garden. Available square meters: 1',
    });
  });

  it('should return 400 for invalid body (missing required fields)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/gardens/${gardenId}/plants`,
      headers: authHeaders(),
      payload: { name: 'Tomato' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should return 400 for invalid gardenId param', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/gardens/not-a-uuid/plants',
      headers: authHeaders(),
      payload: validBody,
    });

    expect(response.statusCode).toBe(400);
  });

  it('should call withTransaction on both connectors', async () => {
    txPlantConnector.createPlant.mockResolvedValue({ id: plantId });
    txPlantMetricConnector.createPlantMetric.mockResolvedValue({ id: 'metric-id' });

    await app.inject({
      method: 'POST',
      url: `/api/gardens/${gardenId}/plants`,
      headers: authHeaders(),
      payload: validBody,
    });

    expect(plantConnector.withTransaction).toHaveBeenCalled();
    expect(plantMetricConnector.withTransaction).toHaveBeenCalled();
  });
});
