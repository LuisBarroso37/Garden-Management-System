import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import {
  createGardenSchema,
  updateGardenSchema,
  gardenIdParamsSchema,
  gardenSchema,
} from '../schemas/gardens.js';
import { errorResponseSchema } from '../schemas/error.js';
import { gardenConnector, GardenConnector } from '../connectors/garden.connector.js';
import { createdResultSchema } from '../schemas/created-result.js';

export const createGardenRoutes =
  (gardenConnector: GardenConnector): FastifyPluginAsyncZodOpenApi =>
  async (app) => {
    app.get(
      '/',
      {
        schema: {
          tags: ['Gardens'],
          response: { 200: gardenSchema.array() },
        },
      },
      async () => {
        const gardens = await gardenConnector.getGardens('userId');

        return gardens.map((garden) => ({
          id: garden.id,
          name: garden.name,
          userId: garden.userId,
          ...(garden.locationDescription && { locationDescription: garden.locationDescription }),
          ...(garden.targetHumidityLevel && { targetHumidityLevel: garden.targetHumidityLevel }),
          totalSurfaceArea: garden.totalSurfaceArea,
          createdAt: garden.createdAt,
          updatedAt: garden.updatedAt,
        }));
      },
    );

    app.get(
      '/:gardenId',
      {
        schema: {
          tags: ['Gardens'],
          params: gardenIdParamsSchema,
          response: {
            200: gardenSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { gardenId } = request.params;

        const garden = await gardenConnector.getGarden('userId', gardenId);

        if (!garden) {
          return reply.status(404).send({ errorType: 'NOT_FOUND', message: 'Garden not found' });
        }

        return {
          id: garden.id,
          name: garden.name,
          userId: garden.userId,
          ...(garden.locationDescription && { locationDescription: garden.locationDescription }),
          ...(garden.targetHumidityLevel && { targetHumidityLevel: garden.targetHumidityLevel }),
          totalSurfaceArea: garden.totalSurfaceArea,
          createdAt: garden.createdAt,
          updatedAt: garden.updatedAt,
        };
      },
    );

    app.post(
      '/',
      {
        schema: {
          tags: ['Gardens'],
          body: createGardenSchema,
          response: { 201: createdResultSchema },
        },
      },
      async (request, reply) => {
        const { body } = request;

        const result = await gardenConnector.createGarden('userId', body);

        return reply.status(201).send(result);
      },
    );

    app.put(
      '/:gardenId',
      {
        schema: {
          tags: ['Gardens'],
          params: gardenIdParamsSchema,
          body: updateGardenSchema,
          response: { 200: gardenSchema, 404: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const { gardenId } = request.params;
        const { body } = request;

        const garden = await gardenConnector.updateGarden('userId', gardenId, body);

        if (!garden) {
          return reply.status(404).send({ errorType: 'NOT_FOUND', message: 'Garden not found' });
        }

        return {
          id: garden.id,
          name: garden.name,
          userId: garden.userId,
          ...(garden.locationDescription && { locationDescription: garden.locationDescription }),
          ...(garden.targetHumidityLevel && { targetHumidityLevel: garden.targetHumidityLevel }),
          totalSurfaceArea: garden.totalSurfaceArea,
          createdAt: garden.createdAt,
          updatedAt: garden.updatedAt,
        };
      },
    );

    app.delete(
      '/:gardenId',
      {
        schema: {
          tags: ['Gardens'],
          params: gardenIdParamsSchema,
          response: { 204: {} },
        },
      },
      async (request, reply) => {
        const { gardenId } = request.params;

        await gardenConnector.deleteGarden('userId', gardenId);

        return reply.status(204).send();
      },
    );
  };

export const gardenRoutes = createGardenRoutes(gardenConnector);
