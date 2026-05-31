import { z } from 'zod/v4';
import { PlantType } from '../db/types.js';

export const HUMIDITY_DROP_PER_MINUTE: Record<PlantType, number> = {
  vegetable: 1,
  fruit: 3,
  flower: 4,
};

export const HUMIDITY_GAIN_PER_WATERING: Record<PlantType, number> = {
  vegetable: 16,
  fruit: 18,
  flower: 20,
};

export const WATERING_DURATION_MINUTES = 2;
export const INITIAL_HUMIDITY_LEVEL = 50;

// Net humidity gain after watering = gain - (2 ticks × drop during watering):
// Vegetable: 16% - 2×1% = +14%, Fruit: 18% - 2×3% = +12%, Flower: 20% - 2×4% = +12%
// Buffer = net gain / 2 ≈ 6%, so humidity oscillates symmetrically around the ideal.
export const HUMIDITY_BUFFER = 6;

// Tolerance for irrigation timing in seconds
export const IRRIGATION_TIME_TOLERANCE_SECONDS = 5;

export const irrigationResponseSchema = z.object({
  processed: z.number().meta({ description: 'Number of plants processed', example: 10 }),
  failed: z
    .array(
      z.object({
        plantId: z.uuid().meta({
          description: 'ID of the plant that failed to process',
          example: '550e8400-e29b-41d4-a716-446655440000',
        }),
        error: z.string().meta({
          description: 'Error message describing the failure',
          example: 'Plant not found',
        }),
      }),
    )
    .meta({ description: 'List of plants that failed to process with error details', example: [] }),
});
