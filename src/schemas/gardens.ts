import { z } from 'zod/v4';

export const createGardenSchema = z.object({
  name: z.string().min(1).max(200).meta({ example: 'My Backyard Garden' }),
  totalSurfaceArea: z
    .number()
    .positive()
    .meta({ description: 'Total area in square meters', example: 50.02 }),
  locationDescription: z.string().min(1).max(500).optional().meta({ example: 'Backyard' }),
  targetHumidityLevel: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .meta({ description: 'Target humidity percentage (0-100)', example: 60 }),
});
export type CreateGardenInput = z.infer<typeof createGardenSchema>;

export const updateGardenSchema = createGardenSchema.partial();
export type UpdateGardenInput = z.infer<typeof updateGardenSchema>;

export const connectorGardenSchema = z.object({
  id: z.uuid().meta({
    description: 'Unique garden identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  }),
  userId: z.uuid().meta({
    description: 'Owner user identifier',
    example: '660e8400-e29b-41d4-a716-446655440000',
  }),
  name: z.string().meta({ description: 'Garden name', example: 'My Backyard Garden' }),
  totalSurfaceArea: z.number().meta({ description: 'Total area in square meters', example: 50.02 }),
  locationDescription: z
    .string()
    .nullable()
    .meta({ description: 'Physical location description', example: 'Backyard' }),
  targetHumidityLevel: z
    .number()
    .nullable()
    .meta({ description: 'Target humidity percentage (0-100)', example: 60 }),
  createdAt: z.iso
    .datetime()
    .meta({ description: 'Creation timestamp', example: '2025-03-15T10:00:00Z' }),
  updatedAt: z.iso
    .datetime()
    .meta({ description: 'Last update timestamp', example: '2025-03-15T10:00:00Z' }),
});

export const gardenSchema = connectorGardenSchema.extend({
  locationDescription: z
    .string()
    .optional()
    .meta({ description: 'Physical location description', example: 'Backyard' }),
  targetHumidityLevel: z
    .number()
    .optional()
    .meta({ description: 'Target humidity percentage (0-100)', example: 60 }),
});
export type Garden = z.infer<typeof gardenSchema>;

export const gardenIdParamsSchema = z.object({
  gardenId: z.uuid().meta({ description: 'Garden UUID' }),
});
