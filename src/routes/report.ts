import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import { reportQuerySchema, reportResponseSchema } from '../schemas/report.js';
import { type ReportConnector, reportConnector } from '../connectors/report.connector.js';

export const createReportRoutes =
  (reportConnector: ReportConnector): FastifyPluginAsyncZodOpenApi =>
  async (app) => {
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

        const [wateringFrequency, plantsAdded, totalPlants] = await Promise.all([
          reportConnector.getWateringFrequency(gardenId, from, to),
          reportConnector.getPlantsAddedCount(gardenId, from),
          reportConnector.getTotalPlantCount(gardenId),
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
          plantsDeleted: 0,
        });
      },
    );
  };

export const reportRoutes = createReportRoutes(reportConnector);
