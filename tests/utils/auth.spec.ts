import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  signAccessToken,
  signRefreshTokenJwt,
  verifyAccessToken,
  getRefreshTokenExpiry,
  hashToken,
  generateRefreshToken,
  authenticate,
  ACCESS_TOKEN_TTL_SECONDS,
} from '../../src/utils/auth.js';

describe('Auth Utilities', () => {
  describe('signAccessToken', () => {
    it('should return a valid JWT with the userId as sub claim', () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const token = signAccessToken(userId);

      const decoded = jwt.decode(token) as jwt.JwtPayload;

      expect(decoded.sub).toBe(userId);
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
    });

    it('should set expiry to 15 minutes', () => {
      const token = signAccessToken('user-1');
      const decoded = jwt.decode(token) as jwt.JwtPayload;

      const ttl = decoded.exp! - decoded.iat!;
      expect(ttl).toBe(ACCESS_TOKEN_TTL_SECONDS);
    });
  });

  describe('signRefreshTokenJwt', () => {
    it('should return a valid JWT with userId as sub claim', () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const token = signRefreshTokenJwt(userId);

      const decoded = jwt.decode(token) as jwt.JwtPayload;

      expect(decoded.sub).toBe(userId);
    });

    it('should set expiry to 7 days', () => {
      const token = signRefreshTokenJwt('user-1');
      const decoded = jwt.decode(token) as jwt.JwtPayload;

      const ttl = decoded.exp! - decoded.iat!;
      expect(ttl).toBe(7 * 24 * 60 * 60);
    });
  });

  describe('verifyAccessToken', () => {
    it('should return the decoded payload for a valid token', () => {
      const userId = 'user-123';
      const token = signAccessToken(userId);

      const payload = verifyAccessToken(token);

      expect(payload.sub).toBe(userId);
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });

    it('should throw for an expired token', () => {
      const token = jwt.sign({ sub: 'user-1' }, process.env.JWT_ACCESS_SECRET!, {
        expiresIn: -1,
      });

      expect(() => verifyAccessToken(token)).toThrow();
    });

    it('should throw for a token signed with a different secret', () => {
      const token = jwt.sign({ sub: 'user-1' }, 'wrong-secret-that-is-long-enough-32chars!', {
        expiresIn: '15m',
      });

      expect(() => verifyAccessToken(token)).toThrow();
    });
  });

  describe('getRefreshTokenExpiry', () => {
    it('should return a date 7 days in the future', () => {
      const before = Date.now();
      const expiry = getRefreshTokenExpiry();
      const after = Date.now();

      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      expect(expiry.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs);
      expect(expiry.getTime()).toBeLessThanOrEqual(after + sevenDaysMs);
    });
  });

  describe('hashToken', () => {
    it('should return a SHA-256 hex string', () => {
      const hash = hashToken('my-token');

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce consistent output for the same input', () => {
      expect(hashToken('token-a')).toBe(hashToken('token-a'));
    });

    it('should produce different output for different inputs', () => {
      expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
    });
  });

  describe('generateRefreshToken', () => {
    it('should return a hex string of 80 characters (40 bytes)', () => {
      const token = generateRefreshToken();

      expect(token).toMatch(/^[0-9a-f]{80}$/);
    });

    it('should return unique values on each call', () => {
      const a = generateRefreshToken();
      const b = generateRefreshToken();

      expect(a).not.toBe(b);
    });
  });

  describe('authenticate', () => {
    const mockReply = () => {
      const reply = {
        status: vi.fn(),
        send: vi.fn(),
      } as unknown as FastifyReply;
      (reply.status as ReturnType<typeof vi.fn>).mockReturnValue(reply);
      (reply.send as ReturnType<typeof vi.fn>).mockReturnValue(reply);
      return reply;
    };

    const mockRequest = (headers: Record<string, string> = {}) =>
      ({ headers }) as unknown as FastifyRequest;

    it('should set request.userId for a valid token', async () => {
      const userId = 'user-abc';
      const token = signAccessToken(userId);
      const request = mockRequest({ authorization: `Bearer ${token}` });
      const reply = mockReply();

      await authenticate(request, reply);

      expect(request.userId).toBe(userId);
    });

    it('should return 401 when no authorization header is present', async () => {
      const request = mockRequest();
      const reply = mockReply();

      await authenticate(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        errorType: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization header',
      });
    });

    it('should return 401 when authorization header does not start with Bearer', async () => {
      const request = mockRequest({ authorization: 'Basic abc123' });
      const reply = mockReply();

      await authenticate(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 for an invalid token', async () => {
      const request = mockRequest({ authorization: 'Bearer invalid.token.here' });
      const reply = mockReply();

      await authenticate(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        errorType: 'UNAUTHORIZED',
        message: 'Invalid or expired access token',
      });
    });

    it('should return 401 for an expired token', async () => {
      const expiredToken = jwt.sign({ sub: 'user-1' }, process.env.JWT_ACCESS_SECRET!, {
        expiresIn: -1,
      });
      const request = mockRequest({ authorization: `Bearer ${expiredToken}` });
      const reply = mockReply();

      await authenticate(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
    });
  });
});
