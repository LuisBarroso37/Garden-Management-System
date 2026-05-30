import { z } from 'zod/v4';

export const createPlantMetricSchema = z.object({
  plantId: z.uuid().meta({ example: '123e4567-e89b-12d3-a456-426614174000' }),
  currentHumidityLevel: z.number().min(0).max(100).meta({ example: 45 }),
  lastIrrigationStartTime: z.iso.datetime().optional().meta({ example: '2025-03-15T10:00:00Z' }),
  lastIrrigationEndTime: z.iso.datetime().optional().meta({ example: '2025-03-15T10:00:00Z' }),
});
export type CreatePlantMetricInput = z.infer<typeof createPlantMetricSchema>;

export const connectorPlantMetricSchema = z.object({
  id: z.uuid().meta({ example: '123e4567-e89b-12d3-a456-426614174000' }),
  plantId: z.uuid().meta({ example: '123e4567-e89b-12d3-a456-426614174000' }),
  currentHumidityLevel: z.number().meta({ example: 45 }),
  lastIrrigationStartTime: z.iso.datetime().nullable().meta({ example: '2025-03-15T10:00:00Z' }),
  lastIrrigationEndTime: z.iso.datetime().nullable().meta({ example: '2025-03-15T10:00:00Z' }),
  createdAt: z.iso.datetime().meta({ example: '2025-03-15T10:00:00Z' }),
});

export const plantMetricSchema = connectorPlantMetricSchema.extend({
  lastIrrigationStartTime: z.iso.datetime().optional().meta({ example: '2025-03-15T10:00:00Z' }),
  lastIrrigationEndTime: z.iso.datetime().optional().meta({ example: '2025-03-15T10:00:00Z' }),
});
