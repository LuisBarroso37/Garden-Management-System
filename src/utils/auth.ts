import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { dayjs } from './dayjs.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
}

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

export function signRefreshTokenJwt(userId: string): string {
  return jwt.sign({ sub: userId }, config.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, config.JWT_ACCESS_SECRET) as JwtPayload;
}

export function getRefreshTokenExpiry(): Date {
  return dayjs.utc().add(REFRESH_TOKEN_TTL_SECONDS, 'seconds').toDate();
}

/**
 * Hash a refresh token for storage (we never store raw tokens in the DB).
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a cryptographically secure refresh token.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

/**
 * Fastify preHandler hook that validates the access token.
 * Attaches `request.userId` for downstream handlers.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      errorType: 'UNAUTHORIZED',
      message: 'Missing or invalid Authorization header',
    });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const payload = verifyAccessToken(token);
    request.userId = payload.sub;
  } catch {
    return reply.status(401).send({
      errorType: 'UNAUTHORIZED',
      message: 'Invalid or expired access token',
    });
  }
}
