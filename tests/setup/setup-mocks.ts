import { vi, type Mocked } from 'vitest';
import type { PlantConnector } from '../../src/connectors/plant.connector.js';
import type { GardenConnector } from '../../src/connectors/garden.connector.js';
import type { PlantMetricConnector } from '../../src/connectors/plant-metric.connector.js';
import type { IrrigationConnector } from '../../src/connectors/irrigation.connector.js';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/db/types.js';

export const createMockPlantConnector = (): Mocked<PlantConnector> => ({
  getPlant: vi.fn<PlantConnector['getPlant']>(),
  getPlants: vi.fn<PlantConnector['getPlants']>().mockResolvedValue([]),
  createPlant: vi.fn<PlantConnector['createPlant']>(),
  updatePlant: vi.fn<PlantConnector['updatePlant']>(),
  deletePlant: vi.fn<PlantConnector['deletePlant']>(),
  withTransaction: vi.fn<PlantConnector['withTransaction']>(),
});

export const createMockGardenConnector = (): Mocked<GardenConnector> => ({
  getGarden: vi.fn<GardenConnector['getGarden']>(),
  getGardens: vi.fn<GardenConnector['getGardens']>(),
  createGarden: vi.fn<GardenConnector['createGarden']>(),
  updateGarden: vi.fn<GardenConnector['updateGarden']>(),
  deleteGarden: vi.fn<GardenConnector['deleteGarden']>(),
});

export const createMockPlantMetricConnector = (): Mocked<PlantMetricConnector> => ({
  getLatestPlantMetricsForIds: vi.fn<PlantMetricConnector['getLatestPlantMetricsForIds']>(),
  createPlantMetric: vi.fn<PlantMetricConnector['createPlantMetric']>(),
  withTransaction: vi.fn<PlantMetricConnector['withTransaction']>(),
});

export const createMockDatabase = () =>
  ({
    transaction: () => ({
      execute: (fn: (trx: unknown) => Promise<unknown>) => fn({}),
    }),
  }) as unknown as Kysely<DB>;

export const createMockIrrigationConnector = (): Mocked<IrrigationConnector> => ({
  sendCommand: vi.fn<IrrigationConnector['sendCommand']>().mockResolvedValue(undefined),
});
