import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import { z } from 'zod/v4';
import { PlantConnector, plantConnector } from '../connectors/plant.connector.js';
import { irrigationResponseSchema, WATERING_DURATION_MINUTES } from '../schemas/irrigation.js';
import { authenticate } from '../utils/auth.js';
import {
  PlantMetricConnector,
  plantMetricConnector,
} from '../connectors/plant-metric.connector.js';
import { dayjs } from '../utils/dayjs.js';
import type { Dayjs } from '../utils/dayjs.js';
import {
  type IrrigationConnector,
  irrigationConnector,
} from '../connectors/irrigation.connector.js';
import {
  computeHumidityAfterDrop,
  computeHumidityAfterWatering,
  computeIrrigationEndTime,
  isCurrentlyBeingWatered,
  isWithinIrrigationEndWindow,
  needsIrrigation,
} from '../utils/irrigation.js';
import type { Selectable } from 'kysely';
import type { Plant, PlantMetric } from '../db/types.js';
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('irrigation');

interface TickContext {
  now: Dayjs;
  timestamp: string;
  gardenId: string;
}

const processPlantTick = async (
  plant: Selectable<Plant>,
  plantMetric: Selectable<PlantMetric> | undefined,
  ctx: TickContext,
  irrigationConnector: IrrigationConnector,
  plantMetricConnector: PlantMetricConnector,
): Promise<void> => {
  return tracer.startActiveSpan(
    'irrigation.processPlantTick',
    {
      attributes: {
        'app.plantId': plant.id,
        'app.gardenId': ctx.gardenId,
        'app.plantType': plant.plantType,
      },
    },
    async (span) => {
      try {
        if (!plantMetric) {
          span.addEvent('skipped', { reason: 'no metric record' });
          return;
        }

        span.setAttribute('app.currentHumidity', plantMetric.currentHumidityLevel);
        span.setAttribute('app.idealHumidity', plant.idealHumidityLevel);

        if (isWithinIrrigationEndWindow(ctx.now, plantMetric.lastIrrigationEndTime)) {
          span.addEvent('stop_watering');

          await irrigationConnector.sendCommand({
            type: 'STOP_WATERING',
            plantId: plant.id,
            gardenId: ctx.gardenId,
            timestamp: ctx.timestamp,
          });
          await plantMetricConnector.createPlantMetric({
            plantId: plant.id,
            currentHumidityLevel: computeHumidityAfterWatering(
              plantMetric.currentHumidityLevel,
              plant.plantType,
            ),
            lastIrrigationStartTime: plantMetric.lastIrrigationStartTime ?? undefined,
            lastIrrigationEndTime: plantMetric.lastIrrigationEndTime ?? undefined,
          });
          return;
        }

        if (isCurrentlyBeingWatered(ctx.now, plantMetric.lastIrrigationEndTime)) {
          span.addEvent('currently_watering');

          await plantMetricConnector.createPlantMetric({
            plantId: plant.id,
            currentHumidityLevel: plantMetric.currentHumidityLevel,
            lastIrrigationStartTime: plantMetric.lastIrrigationStartTime ?? undefined,
            lastIrrigationEndTime: plantMetric.lastIrrigationEndTime ?? undefined,
          });
          return;
        }

        const currentHumidityLevel = computeHumidityAfterDrop(
          plantMetric.currentHumidityLevel,
          plant.plantType,
        );

        span.setAttribute('app.humidityAfterDrop', currentHumidityLevel);

        if (needsIrrigation(currentHumidityLevel, plant.idealHumidityLevel)) {
          span.addEvent('start_watering', {
            humidity: currentHumidityLevel,
            threshold: plant.idealHumidityLevel,
          });

          await irrigationConnector.sendCommand({
            type: 'START_WATERING',
            plantId: plant.id,
            gardenId: ctx.gardenId,
            timestamp: ctx.timestamp,
            durationSeconds: WATERING_DURATION_MINUTES * 60,
          });
          await plantMetricConnector.createPlantMetric({
            plantId: plant.id,
            currentHumidityLevel,
            lastIrrigationStartTime: ctx.timestamp,
            lastIrrigationEndTime: computeIrrigationEndTime(ctx.now),
          });
        } else {
          span.addEvent('humidity_ok');
          await plantMetricConnector.createPlantMetric({
            plantId: plant.id,
            currentHumidityLevel,
          });
        }
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
        throw error;
      } finally {
        span.end();
      }
    },
  );
};

export const createIrrigationRoutes =
  (
    plantConnector: PlantConnector,
    plantMetricConnector: PlantMetricConnector,
    irrigationConnector: IrrigationConnector,
  ): FastifyPluginAsyncZodOpenApi =>
  async (app) => {
    app.addHook('onRequest', authenticate);

    app.post(
      '/',
      {
        schema: {
          tags: ['Irrigation'],
          body: z.object({
            gardenId: z.uuid(),
          }),
          response: {
            200: irrigationResponseSchema,
            207: irrigationResponseSchema,
            500: irrigationResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { gardenId } = request.body;
        const { userId } = request;

        trace.getActiveSpan()?.setAttribute('app.gardenId', gardenId);

        const plants = await plantConnector.getPlants(userId, gardenId);

        if (plants.length === 0) {
          return reply.status(200).send({ processed: 0, failed: [] });
        }

        const plantIds = plants.map((plant) => plant.id);

        const latestPlantMetrics = await plantMetricConnector.getLatestPlantMetricsForIds(plantIds);

        const now = dayjs.utc();
        const timestamp = now.format('YYYY-MM-DDTHH:mm:ss[Z]');
        const ctx: TickContext = { now, timestamp, gardenId };

        const BATCH_SIZE = 10;
        const failures: { plantId: string; error: string }[] = [];

        for (let i = 0; i < plants.length; i += BATCH_SIZE) {
          const batch = plants.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map((plant) => {
              const plantMetric = latestPlantMetrics.find((metric) => metric.plantId === plant.id);
              return processPlantTick(
                plant,
                plantMetric,
                ctx,
                irrigationConnector,
                plantMetricConnector,
              );
            }),
          );

          for (const [index, result] of results.entries()) {
            if (result.status === 'rejected') {
              const plantId = batch[index].id;
              const error =
                result.reason instanceof Error ? result.reason.message : 'Unknown error';
              request.log.error(
                { plantId, gardenId, error: result.reason },
                'Failed to process irrigation tick for plant',
              );
              failures.push({ plantId, error });
            }
          }
        }

        const processed = plants.length - failures.length;
        const responseBody = { processed, failed: failures };

        trace.getActiveSpan()?.setAttributes({
          'app.irrigation.plantCount': plants.length,
          'app.irrigation.processed': processed,
          'app.irrigation.failed': failures.length,
        });

        if (failures.length === plants.length) {
          return reply.status(500).send(responseBody);
        }

        if (failures.length > 0) {
          return reply.status(207).send(responseBody);
        }

        return reply.status(200).send(responseBody);
      },
    );
  };

export const irrigationRoutes = createIrrigationRoutes(
  plantConnector,
  plantMetricConnector,
  irrigationConnector,
);
