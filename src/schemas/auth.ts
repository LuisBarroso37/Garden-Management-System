import { z } from 'zod/v4';

export const registerSchema = z.object({
  email: z.email().meta({ example: 'user@example.com' }),
  password: z
    .string()
    .min(8)
    .max(128)
    .meta({ description: 'Must be at least 8 characters', example: 'SecureP@ss1' }),
  firstName: z.string().min(1).max(100).meta({ example: 'John' }),
  lastName: z.string().min(1).max(100).meta({ example: 'Doe' }),
  age: z.number().int().min(1).max(150).meta({ example: 30 }),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email().meta({ example: 'user@example.com' }),
  password: z.string().min(1).meta({ example: 'SecureP@ss1' }),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const tokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive().meta({ description: 'Access token TTL in seconds' }),
});

export const userResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  firstName: z.string(),
  lastName: z.string(),
  age: z.number().int(),
  createdAt: z.iso.datetime(),
});

export const authResponseSchema = z.object({
  user: userResponseSchema,
  tokens: tokenResponseSchema,
});

export const refreshTokenRecordSchema = z.object({
  id: z.string(),
  userId: z.string(),
});
