import type { Kysely } from 'kysely';
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import { trace } from '@opentelemetry/api';
import { errorResponseSchema } from '../schemas/error.js';
import { plantConnector, type PlantConnector } from '../connectors/plant.connector.js';
import {
  createPlantSchema,
  plantParamsSchema,
  plantSchema,
  updatePlantSchema,
} from '../schemas/plants.js';
import { createdResultSchema } from '../schemas/created-result.js';
import { gardenConnector, GardenConnector } from '../connectors/garden.connector.js';
import { gardenIdParamsSchema } from '../schemas/gardens.js';
import { getAvailableGardenSurfaceArea } from '../utils/get-available-surface-area.js';
import {
  plantMetricConnector,
  PlantMetricConnector,
} from '../connectors/plant-metric.connector.js';
import { INITIAL_HUMIDITY_LEVEL } from '../schemas/irrigation.js';
import type { DB } from '../db/types.js';
import { authenticate } from '../utils/auth.js';

export const createPlantRoutes =
  (
    plantConnector: PlantConnector,
    gardenConnector: GardenConnector,
    plantMetricConnector: PlantMetricConnector,
    database: Kysely<DB>,
  ): FastifyPluginAsyncZodOpenApi =>
  async (app) => {
    app.addHook('onRequest', authenticate);

    app.get(
      '/',
      {
        schema: {
          tags: ['Plants'],
          params: gardenIdParamsSchema,
          response: {
            200: plantSchema.array(),
            404: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const { gardenId } = request.params;
        const { userId } = request;

        trace.getActiveSpan()?.setAttribute('app.gardenId', gardenId);

        return plantConnector.getPlants(userId, gardenId);
      },
    );

    app.get(
      '/:plantId',
      {
        schema: {
          tags: ['Plants'],
          params: plantParamsSchema,
          response: {
            200: plantSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { gardenId, plantId } = request.params;
        const { userId } = request;

        trace.getActiveSpan()?.setAttributes({
          'app.gardenId': gardenId,
          'app.plantId': plantId,
        });

        const plant = await plantConnector.getPlant(userId, gardenId, plantId);

        if (!plant) {
          return reply.status(404).send({ errorType: 'NOT_FOUND', message: 'Plant not found' });
        }

        return plant;
      },
    );

    app.post(
      '/',
      {
        schema: {
          tags: ['Plants'],
          params: gardenIdParamsSchema,
          body: createPlantSchema,
          response: {
            201: createdResultSchema,
            400: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { gardenId } = request.params;
        const { body, userId } = request;

        trace.getActiveSpan()?.setAttribute('app.gardenId', gardenId);

        const garden = await gardenConnector.getGarden(userId, gardenId);

        if (!garden) {
          return reply.status(404).send({ errorType: 'NOT_FOUND', message: 'Garden not found' });
        }

        const plants = await plantConnector.getPlants(userId, gardenId);

        const plantSurfaceAreas = plants.map((p) => Number(p.surfaceAreaRequired));
        const availableSurfaceArea = getAvailableGardenSurfaceArea(
          garden.totalSurfaceArea,
          plantSurfaceAreas,
        );

        if (availableSurfaceArea < body.surfaceAreaRequired) {
          return reply.status(400).send({
            errorType: 'INSUFFICIENT_SURFACE_AREA',
            message: `Not enough surface area in the garden. Available square meters: ${availableSurfaceArea}`,
          });
        }

        const result = await database.transaction().execute(async (trx) => {
          const plant = await plantConnector.withTransaction(trx).createPlant(gardenId, body);
          await plantMetricConnector.withTransaction(trx).createPlantMetric({
            plantId: plant.id,
            currentHumidityLevel: INITIAL_HUMIDITY_LEVEL,
          });

          return plant;
        });

        return reply.status(201).send(result);
      },
    );

    app.put(
      '/:plantId',
      {
        schema: {
          tags: ['Plants'],
          params: plantParamsSchema,
          body: updatePlantSchema,
          response: { 200: plantSchema, 400: errorResponseSchema, 404: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const { gardenId, plantId } = request.params;
        const { body, userId } = request;

        trace.getActiveSpan()?.setAttributes({
          'app.gardenId': gardenId,
          'app.plantId': plantId,
        });

        if (body.surfaceAreaRequired) {
          const garden = await gardenConnector.getGarden(userId, gardenId);

          if (!garden) {
            return reply.status(404).send({ errorType: 'NOT_FOUND', message: 'Garden not found' });
          }

          const plants = await plantConnector.getPlants(userId, gardenId);

          const plantSurfaceAreas = plants.map((p) => Number(p.surfaceAreaRequired));
          const availableSurfaceArea = getAvailableGardenSurfaceArea(
            garden.totalSurfaceArea,
            plantSurfaceAreas,
          );

          if (availableSurfaceArea < body.surfaceAreaRequired) {
            return reply.status(400).send({
              errorType: 'INSUFFICIENT_SURFACE_AREA',
              message: `Not enough surface area in the garden. Available square meters: ${availableSurfaceArea}`,
            });
          }
        }

        const plant = await plantConnector.updatePlant(userId, gardenId, plantId, body);

        if (!plant) {
          return reply.status(404).send({ errorType: 'NOT_FOUND', message: 'Plant not found' });
        }

        return plant;
      },
    );

    app.delete(
      '/:plantId',
      {
        schema: {
          tags: ['Plants'],
          params: plantParamsSchema,
          response: { 204: { type: 'null' } },
        },
      },
      async (request, reply) => {
        const { gardenId, plantId } = request.params;
        const { userId } = request;

        trace.getActiveSpan()?.setAttributes({
          'app.gardenId': gardenId,
          'app.plantId': plantId,
        });

        await plantConnector.deletePlant(userId, gardenId, plantId);

        return reply.status(204).send();
      },
    );
  };

import { createKyselyDatabaseClient } from '../db/index.js';

export const plantRoutes = createPlantRoutes(
  plantConnector,
  gardenConnector,
  plantMetricConnector,
  createKyselyDatabaseClient(),
);
