import { z } from 'zod/v4';

export const errorResponseSchema = z.object({
  errorType: z.string().meta({ example: 'NOT_FOUND' }),
  message: z.string().meta({ example: 'Garden not found' }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
