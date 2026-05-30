import { z } from 'zod/v4';
import { gardenIdParamsSchema } from './gardens';

const plantTypeSchema = z.enum(['flower', 'fruit', 'vegetable']);

export const createPlantSchema = z.object({
  name: z.string().min(1).max(200).meta({ example: 'Tomato' }),
  species: z.string().min(1).max(200).meta({ example: 'Solanum lycopersicum' }),
  plantType: plantTypeSchema.meta({ example: 'vegetable' }),
  plantationDate: z.iso.datetime().meta({ example: '2025-03-15T10:00:00Z' }),
  surfaceAreaRequired: z.number().min(0).meta({ example: 2.5 }),
  idealHumidityLevel: z.number().min(0).max(100).meta({ example: 60 }),
});
export type CreatePlantInput = z.infer<typeof createPlantSchema>;

export const updatePlantSchema = z
  .object({
    name: z.string().meta({ description: 'Plant name', example: 'Tomato' }),
    species: z.string().meta({ description: 'Plant species', example: 'Solanum lycopersicum' }),
    plantType: plantTypeSchema.meta({ description: 'Type of plant', example: 'vegetable' }),
    plantationDate: z.iso
      .datetime()
      .meta({ description: 'Date the plant was planted', example: '2025-03-15T10:00:00Z' }),
    surfaceAreaRequired: z
      .number()
      .min(0)
      .meta({ description: 'Required area in square meters', example: 2.5 }),
    idealHumidityLevel: z
      .number()
      .min(0)
      .max(100)
      .meta({ description: 'Ideal humidity percentage (0-100)', example: 60 }),
  })
  .partial();
export type UpdatePlantInput = z.infer<typeof updatePlantSchema>;

export const plantSchema = z.object({
  id: z.uuid().meta({
    description: 'Unique plant identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  }),
  gardenId: z.uuid().meta({
    description: 'Garden this plant belongs to',
    example: '660e8400-e29b-41d4-a716-446655440000',
  }),
  name: z.string().meta({ description: 'Plant name', example: 'Tomato' }),
  species: z.string().meta({ description: 'Plant species', example: 'Solanum lycopersicum' }),
  plantType: plantTypeSchema.meta({ description: 'Type of plant', example: 'vegetable' }),
  plantationDate: z.iso
    .datetime()
    .meta({ description: 'Date the plant was planted', example: '2025-03-15T10:00:00Z' }),
  surfaceAreaRequired: z
    .number()
    .meta({ description: 'Required area in square meters', example: 2.5 }),
  idealHumidityLevel: z
    .number()
    .meta({ description: 'Ideal humidity percentage (0-100)', example: 60 }),
  createdAt: z.iso
    .datetime()
    .meta({ description: 'Creation timestamp', example: '2025-03-15T10:00:00Z' }),
  updatedAt: z.iso
    .datetime()
    .meta({ description: 'Last update timestamp', example: '2025-03-15T10:00:00Z' }),
});
export type Plant = z.infer<typeof plantSchema>;

export const plantParamsSchema = gardenIdParamsSchema.extend({
  plantId: z.uuid().meta({ description: 'Plant UUID' }),
});
