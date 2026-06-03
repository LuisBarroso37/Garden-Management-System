import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import { reportQuerySchema, reportResponseSchema } from '../schemas/report.js';
import { type ReportConnector, reportConnector } from '../connectors/report.connector.js';
import { authenticate } from '../utils/auth.js';
import { trace } from '@opentelemetry/api';

export const createReportRoutes =
  (reportConnector: ReportConnector): FastifyPluginAsyncZodOpenApi =>
  async (app) => {
    app.addHook('onRequest', authenticate);

    app.get(
      '/',
      {
        schema: {
          tags: ['Reports'],
          querystring: reportQuerySchema,
          response: {
            200: reportResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { gardenId, from, to } = request.query;
        const { userId } = request;

        trace.getActiveSpan()?.setAttribute('app.gardenId', gardenId);

        const [wateringFrequency, plantsAdded, totalPlants, plantsDeleted] = await Promise.all([
          reportConnector.getWateringFrequency(userId, gardenId, from, to),
          reportConnector.getPlantsAddedCount(userId, gardenId, from),
          reportConnector.getTotalPlantCount(userId, gardenId),
          reportConnector.getPlantsDeletedCount(userId, gardenId, from),
        ]);

        const wateredPlantIds = new Set(wateringFrequency.map((row) => row.plantId));
        const wateredPlants = wateredPlantIds.size;
        const unwateredPlants = totalPlants - wateredPlants;

        return reply.status(200).send({
          gardenId,
          period: { from, to },
          wateredPlants,
          unwateredPlants,
          wateringFrequency,
          plantsAdded,
          plantsDeleted,
        });
      },
    );
  };

export const reportRoutes = createReportRoutes(reportConnector);
