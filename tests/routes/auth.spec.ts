import { describe, it, expect, beforeAll, beforeEach, afterAll, type Mocked } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createAuthRoutes } from '../../src/routes/auth.js';
import type { AuthConnector } from '../../src/connectors/auth.connector.js';
import {
  EmailAlreadyExistsError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
} from '../../src/connectors/auth.connector.js';
import { createMockAuthConnector } from '../setup/setup-mocks.js';
import { createTestApp } from '../setup/create-test-app.js';
import { signAccessToken } from '../../src/utils/auth.js';

const userId = '550e8400-e29b-41d4-a716-446655440000';

const makeUser = (overrides = {}) => ({
  id: userId,
  email: 'test@example.com',
  firstName: 'John',
  lastName: 'Doe',
  age: 30,
  createdAt: '2025-03-15T10:00:00Z',
  ...overrides,
});

describe('Auth Routes', () => {
  let connector: Mocked<AuthConnector>;
  let app: FastifyInstance;

  beforeAll(async () => {
    connector = createMockAuthConnector();

    app = await createTestApp([
      {
        plugin: createAuthRoutes(connector),
        prefix: '/api/auth',
      },
    ]);
  });

  beforeEach(() => {
    connector.register.mockReset();
    connector.verifyCredentials.mockReset();
    connector.storeRefreshToken.mockReset().mockResolvedValue(undefined);
    connector.verifyRefreshToken.mockReset();
    connector.revokeRefreshToken.mockReset().mockResolvedValue(undefined);
    connector.revokeAllUserTokens.mockReset().mockResolvedValue(undefined);
    connector.deleteUser.mockReset().mockResolvedValue(undefined);
    connector.getUserById.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/register', () => {
    const validPayload = {
      email: 'test@example.com',
      password: 'SecureP@ss123',
      firstName: 'John',
      lastName: 'Doe',
      age: 30,
    };

    it('should return 201 with user and tokens on successful registration', async () => {
      connector.register.mockResolvedValue(makeUser());

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: validPayload,
      });

      expect(connector.storeRefreshToken).toHaveBeenCalledWith(
        userId,
        expect.any(String),
        expect.any(Date),
      );
      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body.user.email).toBe('test@example.com');
      expect(body.tokens.accessToken).toBeDefined();
      expect(body.tokens.refreshToken).toBeDefined();
      expect(body.tokens.expiresIn).toBe(900);
    });

    it('should return 409 when email already exists', async () => {
      connector.register.mockRejectedValue(new EmailAlreadyExistsError('test@example.com'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: validPayload,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().errorType).toBe('CONFLICT');
    });

    it('should return 400 for invalid email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { ...validPayload, email: 'not-an-email' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for password shorter than 8 characters', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { ...validPayload, password: 'short' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    const loginPayload = {
      email: 'test@example.com',
      password: 'SecureP@ss123',
    };

    it('should return 200 with user and tokens on valid credentials', async () => {
      connector.verifyCredentials.mockResolvedValue(makeUser());

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: loginPayload,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.user.email).toBe('test@example.com');
      expect(body.tokens.accessToken).toBeDefined();
      expect(body.tokens.refreshToken).toBeDefined();
      expect(body.tokens.expiresIn).toBe(900);
    });

    it('should return 401 for invalid credentials', async () => {
      connector.verifyCredentials.mockRejectedValue(new InvalidCredentialsError());

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: loginPayload,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().errorType).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return 200 with new tokens on valid refresh token', async () => {
      connector.verifyRefreshToken.mockResolvedValue({ id: 'token-id', userId });
      connector.getUserById.mockResolvedValue(makeUser());

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: 'valid-refresh-token' },
      });

      expect(connector.revokeRefreshToken).toHaveBeenCalledWith(expect.any(String));
      expect(connector.storeRefreshToken).toHaveBeenCalledWith(
        userId,
        expect.any(String),
        expect.any(Date),
      );
      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.expiresIn).toBe(900);
    });

    it('should return 401 for an invalid refresh token', async () => {
      connector.verifyRefreshToken.mockRejectedValue(new InvalidRefreshTokenError());

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: 'invalid-token' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().errorType).toBe('UNAUTHORIZED');
    });

    it('should return 401 if user no longer exists', async () => {
      connector.verifyRefreshToken.mockResolvedValue({ id: 'token-id', userId });
      connector.getUserById.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: 'valid-token' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should return 204 on successful logout', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        payload: { refreshToken: 'some-token' },
      });

      expect(connector.revokeRefreshToken).toHaveBeenCalled();
      expect(response.statusCode).toBe(204);
    });

    it('should still return 204 if token revocation fails', async () => {
      connector.revokeRefreshToken.mockRejectedValue(new Error('DB error'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        payload: { refreshToken: 'some-token' },
      });

      expect(response.statusCode).toBe(204);
    });
  });

  describe('DELETE /api/auth/account', () => {
    it('should return 204 when authenticated', async () => {
      const token = signAccessToken(userId);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/auth/account',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(connector.revokeAllUserTokens).toHaveBeenCalledWith(userId);
      expect(connector.deleteUser).toHaveBeenCalledWith(userId);
      expect(response.statusCode).toBe(204);
    });

    it('should return 401 without a token', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/auth/account',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return 200 with user data when authenticated', async () => {
      const token = signAccessToken(userId);
      connector.getUserById.mockResolvedValue(makeUser());

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(userId);
      expect(body.email).toBe('test@example.com');
      expect(body.firstName).toBe('John');
    });

    it('should return 401 if user no longer exists', async () => {
      const token = signAccessToken(userId);
      connector.getUserById.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 without a token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 with an invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: 'Bearer invalid.token.here' },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
