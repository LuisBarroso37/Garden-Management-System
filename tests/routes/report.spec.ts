import { describe, it, expect, beforeAll, beforeEach, afterAll, type Mocked } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createReportRoutes } from '../../src/routes/report.js';
import type { ReportConnector } from '../../src/connectors/report.connector.js';
import { createMockReportConnector } from '../setup/setup-mocks.js';
import { createTestApp } from '../setup/create-test-app.js';

const gardenId = '550e8400-e29b-41d4-a716-446655440000';
const from = '2025-03-15T09:00:00Z';
const to = '2025-03-15T10:00:00Z';

describe('GET /api/reports', () => {
  let reportConnector: Mocked<ReportConnector>;
  let app: FastifyInstance;

  beforeAll(async () => {
    reportConnector = createMockReportConnector();

    app = await createTestApp([
      {
        plugin: createReportRoutes(reportConnector),
        prefix: '/api/reports',
      },
    ]);
  });

  beforeEach(() => {
    reportConnector.getWateringFrequency.mockReset().mockResolvedValue([]);
    reportConnector.getPlantsAddedCount.mockReset().mockResolvedValue(0);
    reportConnector.getTotalPlantCount.mockReset().mockResolvedValue(0);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 200 with report data for a garden with no activity', async () => {
    reportConnector.getTotalPlantCount.mockResolvedValue(5);

    const response = await app.inject({
      method: 'GET',
      url: `/api/reports?gardenId=${gardenId}&from=${from}&to=${to}`,
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toEqual({
      gardenId,
      period: { from, to },
      wateredPlants: 0,
      unwateredPlants: 5,
      wateringFrequency: [],
      plantsAdded: 0,
      plantsDeleted: 0,
    });
  });

  it('should return correct watered/unwatered counts', async () => {
    reportConnector.getTotalPlantCount.mockResolvedValue(3);
    reportConnector.getWateringFrequency.mockResolvedValue([
      { plantId: '660e8400-e29b-41d4-a716-446655440001', plantName: 'Tomato', wateringCount: 2 },
      { plantId: '660e8400-e29b-41d4-a716-446655440002', plantName: 'Rose', wateringCount: 1 },
    ]);
    reportConnector.getPlantsAddedCount.mockResolvedValue(1);

    const response = await app.inject({
      method: 'GET',
      url: `/api/reports?gardenId=${gardenId}&from=${from}&to=${to}`,
    });

    expect(reportConnector.getWateringFrequency).toHaveBeenCalledWith(gardenId, from, to);
    expect(reportConnector.getPlantsAddedCount).toHaveBeenCalledWith(gardenId, from);
    expect(reportConnector.getTotalPlantCount).toHaveBeenCalledWith(gardenId);
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.wateredPlants).toBe(2);
    expect(body.unwateredPlants).toBe(1);
    expect(body.wateringFrequency).toHaveLength(2);
    expect(body.plantsAdded).toBe(1);
    expect(body.plantsDeleted).toBe(0);
  });

  it('should return 400 when gardenId is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/reports?from=${from}&to=${to}`,
    });

    expect(response.statusCode).toBe(400);
  });

  it('should return 400 when from is not a valid datetime', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/reports?gardenId=${gardenId}&from=not-a-date&to=${to}`,
    });

    expect(response.statusCode).toBe(400);
  });

  it('should return 400 when to is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/reports?gardenId=${gardenId}&from=${from}`,
    });

    expect(response.statusCode).toBe(400);
  });
});
