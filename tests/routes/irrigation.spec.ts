import { describe, it, expect, beforeAll, beforeEach, afterAll, type Mocked } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createIrrigationRoutes } from '../../src/routes/irrigation.js';
import type { PlantConnector } from '../../src/connectors/plant.connector.js';
import type { PlantMetricConnector } from '../../src/connectors/plant-metric.connector.js';
import type { IrrigationConnector } from '../../src/connectors/irrigation.connector.js';
import {
  createMockPlantConnector,
  createMockPlantMetricConnector,
  createMockIrrigationConnector,
  authHeaders,
} from '../setup/setup-mocks.js';
import { createTestApp } from '../setup/create-test-app.js';

const gardenId = '550e8400-e29b-41d4-a716-446655440000';
const plantId = '660e8400-e29b-41d4-a716-446655440001';

const makePlant = (overrides = {}) => ({
  id: plantId,
  gardenId,
  name: 'Tomato',
  species: 'Solanum lycopersicum',
  plantType: 'vegetable' as const,
  plantationDate: '2025-03-15T10:00:00Z',
  surfaceAreaRequired: 2.5,
  idealHumidityLevel: 60,
  createdAt: '2025-03-15T10:00:00Z',
  updatedAt: '2025-03-15T10:00:00Z',
  ...overrides,
});

const makeMetric = (overrides = {}) => ({
  id: 'metric-1',
  plantId,
  currentHumidityLevel: 50,
  lastIrrigationStartTime: null,
  lastIrrigationEndTime: null,
  createdAt: '2025-03-15T10:00:00Z',
  ...overrides,
});

describe('POST /api/irrigation', () => {
  let plantConnector: Mocked<PlantConnector>;
  let plantMetricConnector: Mocked<PlantMetricConnector>;
  let irrigationConnector: Mocked<IrrigationConnector>;
  let app: FastifyInstance;

  beforeAll(async () => {
    plantConnector = createMockPlantConnector();
    plantMetricConnector = createMockPlantMetricConnector();
    irrigationConnector = createMockIrrigationConnector();

    app = await createTestApp([
      {
        plugin: createIrrigationRoutes(plantConnector, plantMetricConnector, irrigationConnector),
        prefix: '/api/irrigation',
      },
    ]);
  });

  beforeEach(() => {
    plantConnector.getPlants.mockReset();
    plantMetricConnector.getLatestPlantMetricsForIds.mockReset();
    plantMetricConnector.createPlantMetric.mockReset().mockResolvedValue({ id: 'new-metric' });
    irrigationConnector.sendCommand.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 200 with processed: 0 when garden has no plants', async () => {
    plantConnector.getPlants.mockResolvedValue([]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/irrigation',
      headers: authHeaders(),
      payload: { gardenId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ processed: 0, failed: [] });
  });

  it('should return 400 when gardenId is not a valid uuid', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/irrigation',
      headers: authHeaders(),
      payload: { gardenId: 'not-a-uuid' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should start watering when humidity drops below threshold', async () => {
    const plant = makePlant({ idealHumidityLevel: 60 });
    // humidity 53 → after drop: 53 - 1 = 52 < 60 - 6 = 54 → needs irrigation
    const metric = makeMetric({ currentHumidityLevel: 53 });

    plantConnector.getPlants.mockResolvedValue([plant]);
    plantMetricConnector.getLatestPlantMetricsForIds.mockResolvedValue([metric]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/irrigation',
      headers: authHeaders(),
      payload: { gardenId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ processed: 1, failed: [] });
    expect(irrigationConnector.sendCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'START_WATERING',
        plantId,
        gardenId,
        durationSeconds: 120,
      }),
    );
    expect(plantMetricConnector.createPlantMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        plantId,
        currentHumidityLevel: 52,
        lastIrrigationStartTime: expect.any(String),
        lastIrrigationEndTime: expect.any(String),
      }),
    );
  });

  it('should not start watering when humidity is above threshold', async () => {
    const plant = makePlant({ idealHumidityLevel: 60 });
    // humidity 70 → after drop: 70 - 1 = 69 > 54 → no irrigation
    const metric = makeMetric({ currentHumidityLevel: 70 });

    plantConnector.getPlants.mockResolvedValue([plant]);
    plantMetricConnector.getLatestPlantMetricsForIds.mockResolvedValue([metric]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/irrigation',
      headers: authHeaders(),
      payload: { gardenId },
    });

    expect(response.statusCode).toBe(200);
    expect(irrigationConnector.sendCommand).not.toHaveBeenCalled();
    expect(plantMetricConnector.createPlantMetric).toHaveBeenCalledWith({
      plantId,
      currentHumidityLevel: 69,
    });
  });

  it('should stop watering when within irrigation end window', async () => {
    const plant = makePlant();
    const now = new Date();
    const endTime = new Date(now.getTime() + 1000).toISOString(); // 1s from now (within 5s tolerance)
    const startTime = new Date(now.getTime() - 119000).toISOString();

    const metric = makeMetric({
      currentHumidityLevel: 45,
      lastIrrigationStartTime: startTime,
      lastIrrigationEndTime: endTime,
    });

    plantConnector.getPlants.mockResolvedValue([plant]);
    plantMetricConnector.getLatestPlantMetricsForIds.mockResolvedValue([metric]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/irrigation',
      headers: authHeaders(),
      payload: { gardenId },
    });

    expect(response.statusCode).toBe(200);
    expect(irrigationConnector.sendCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'STOP_WATERING',
        plantId,
        gardenId,
      }),
    );
    expect(plantMetricConnector.createPlantMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        plantId,
        currentHumidityLevel: 61, // 45 + 16 (vegetable gain)
      }),
    );
  });

  it('should persist metric with unchanged humidity when mid-watering', async () => {
    const plant = makePlant();
    const now = new Date();
    const endTime = new Date(now.getTime() + 60000).toISOString(); // 60s from now (mid-watering)
    const startTime = new Date(now.getTime() - 60000).toISOString();

    const metric = makeMetric({
      currentHumidityLevel: 45,
      lastIrrigationStartTime: startTime,
      lastIrrigationEndTime: endTime,
    });

    plantConnector.getPlants.mockResolvedValue([plant]);
    plantMetricConnector.getLatestPlantMetricsForIds.mockResolvedValue([metric]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/irrigation',
      headers: authHeaders(),
      payload: { gardenId },
    });

    expect(response.statusCode).toBe(200);
    expect(irrigationConnector.sendCommand).not.toHaveBeenCalled();
    expect(plantMetricConnector.createPlantMetric).toHaveBeenCalledWith({
      plantId,
      currentHumidityLevel: 45,
      lastIrrigationStartTime: startTime,
      lastIrrigationEndTime: endTime,
    });
  });

  it('should skip plants without metrics', async () => {
    const plant = makePlant();

    plantConnector.getPlants.mockResolvedValue([plant]);
    plantMetricConnector.getLatestPlantMetricsForIds.mockResolvedValue([]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/irrigation',
      headers: authHeaders(),
      payload: { gardenId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ processed: 1, failed: [] });
    expect(irrigationConnector.sendCommand).not.toHaveBeenCalled();
    expect(plantMetricConnector.createPlantMetric).not.toHaveBeenCalled();
  });

  it('should return 207 when some plants fail', async () => {
    const plant1 = makePlant({ id: '660e8400-e29b-41d4-a716-446655440001' });
    const plant2 = makePlant({ id: '660e8400-e29b-41d4-a716-446655440002' });
    const metric1 = makeMetric({
      plantId: '660e8400-e29b-41d4-a716-446655440001',
      currentHumidityLevel: 70,
    });
    const metric2 = makeMetric({
      plantId: '660e8400-e29b-41d4-a716-446655440002',
      currentHumidityLevel: 70,
    });

    plantConnector.getPlants.mockResolvedValue([plant1, plant2]);
    plantMetricConnector.getLatestPlantMetricsForIds.mockResolvedValue([metric1, metric2]);
    plantMetricConnector.createPlantMetric
      .mockResolvedValueOnce({ id: 'ok' })
      .mockRejectedValueOnce(new Error('DB connection lost'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/irrigation',
      headers: authHeaders(),
      payload: { gardenId },
    });

    expect(response.statusCode).toBe(207);
    const body = response.json();
    expect(body.processed).toBe(1);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0]).toEqual({
      plantId: '660e8400-e29b-41d4-a716-446655440002',
      error: 'DB connection lost',
    });
  });

  it('should return 500 when all plants fail', async () => {
    const plant1 = makePlant({ id: '660e8400-e29b-41d4-a716-446655440001' });
    const plant2 = makePlant({ id: '660e8400-e29b-41d4-a716-446655440002' });
    const metric1 = makeMetric({
      plantId: '660e8400-e29b-41d4-a716-446655440001',
      currentHumidityLevel: 70,
    });
    const metric2 = makeMetric({
      plantId: '660e8400-e29b-41d4-a716-446655440002',
      currentHumidityLevel: 70,
    });

    plantConnector.getPlants.mockResolvedValue([plant1, plant2]);
    plantMetricConnector.getLatestPlantMetricsForIds.mockResolvedValue([metric1, metric2]);
    plantMetricConnector.createPlantMetric.mockRejectedValue(new Error('DB is down'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/irrigation',
      headers: authHeaders(),
      payload: { gardenId },
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body.processed).toBe(0);
    expect(body.failed).toHaveLength(2);
  });
});
