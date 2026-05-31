import { z } from 'zod/v4';

export const createdResultSchema = z.object({
  id: z.uuid().meta({
    description: 'Unique identifier of the created resource',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
});

export type CreatedResult = z.infer<typeof createdResultSchema>;
