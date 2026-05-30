import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
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

export const createPlantRoutes =
  (
    plantConnector: PlantConnector,
    gardenConnector: GardenConnector,
  ): FastifyPluginAsyncZodOpenApi =>
  async (app) => {
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

        return plantConnector.getPlants(gardenId);
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

        const plant = await plantConnector.getPlant(gardenId, plantId);

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
        const { body } = request;

        const garden = await gardenConnector.getGarden('userId', gardenId);

        if (!garden) {
          return reply.status(404).send({ errorType: 'NOT_FOUND', message: 'Garden not found' });
        }

        const plants = await plantConnector.getPlants(gardenId);

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

        const result = await plantConnector.createPlant(gardenId, body);

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
        const { body } = request;

        if (body.surfaceAreaRequired) {
          const garden = await gardenConnector.getGarden('userId', gardenId);

          if (!garden) {
            return reply.status(404).send({ errorType: 'NOT_FOUND', message: 'Garden not found' });
          }

          const plants = await plantConnector.getPlants(gardenId);

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

        const plant = await plantConnector.updatePlant(gardenId, plantId, body);

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
          response: { 204: {} },
        },
      },
      async (request, reply) => {
        const { gardenId, plantId } = request.params;

        await plantConnector.deletePlant(gardenId, plantId);

        return reply.status(204).send();
      },
    );
  };

export const plantRoutes = createPlantRoutes(plantConnector, gardenConnector);
