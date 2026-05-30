import { z } from 'zod/v4';

export const reportQuerySchema = z.object({
  gardenId: z.uuid().meta({
    description: 'ID of the garden to generate the report for',
    example: '550e8400-e29b-41d4-a716-446655440000',
  }),
  from: z.iso.datetime().meta({
    description: 'Start of the reporting period',
    example: '2025-03-15T09:00:00Z',
  }),
  to: z.iso.datetime().meta({
    description: 'End of the reporting period',
    example: '2025-03-15T10:00:00Z',
  }),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const wateringFrequencySchema = z.object({
  plantId: z.uuid(),
  plantName: z.string(),
  wateringCount: z.number(),
});
export type WateringFrequencyRow = z.infer<typeof wateringFrequencySchema>;

export const reportResponseSchema = z.object({
  gardenId: z.uuid().meta({
    description: 'ID of the garden the report is for',
    example: '550e8400-e29b-41d4-a716-446655440000',
  }),
  period: z.object({
    from: z.iso.datetime().meta({
      description: 'Start of the reporting period',
      example: '2025-03-15T09:00:00Z',
    }),
    to: z.iso.datetime().meta({
      description: 'End of the reporting period',
      example: '2025-03-15T10:00:00Z',
    }),
  }),
  wateredPlants: z
    .number()
    .meta({ description: 'Number of plants that were watered in the period', example: 5 }),
  unwateredPlants: z
    .number()
    .meta({ description: 'Number of plants that were not watered in the period', example: 3 }),
  wateringFrequency: z.array(wateringFrequencySchema).meta({
    description: 'Watering count per plant in the period',
    example: [
      {
        plantId: '660e8400-e29b-41d4-a716-446655440001',
        plantName: 'Tomato',
        wateringCount: 3,
      },
    ],
  }),
  plantsAdded: z
    .number()
    .meta({ description: 'Number of plants added since the start of the period', example: 2 }),
  plantsDeleted: z
    .number()
    .meta({ description: 'Number of plants deleted since the start of the period', example: 1 }),
});
export type ReportResponse = z.infer<typeof reportResponseSchema>;
