import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  authResponseSchema,
  tokenResponseSchema,
  userResponseSchema,
} from '../schemas/auth.js';
import { errorResponseSchema } from '../schemas/error.js';
import {
  authConnector,
  AuthConnector,
  EmailAlreadyExistsError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
} from '../connectors/auth.connector.js';
import {
  signAccessToken,
  authenticate,
  getRefreshTokenExpiry,
  ACCESS_TOKEN_TTL_SECONDS,
  generateRefreshToken,
  hashToken,
} from '../utils/auth.js';
import { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';

export const createAuthRoutes =
  (authConnector: AuthConnector): FastifyPluginAsyncZodOpenApi =>
  async (app) => {
    app.post(
      '/register',
      {
        schema: {
          tags: ['Auth'],
          body: registerSchema,
          response: {
            201: authResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const user = await authConnector.register(request.body);

          const accessToken = signAccessToken(user.id);
          const refreshToken = generateRefreshToken();
          const tokenHash = hashToken(refreshToken);

          await authConnector.storeRefreshToken(user.id, tokenHash, getRefreshTokenExpiry());

          return reply.status(201).send({
            user: {
              id: user.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              age: user.age,
              createdAt: user.createdAt,
            },
            tokens: {
              accessToken,
              refreshToken,
              expiresIn: ACCESS_TOKEN_TTL_SECONDS,
            },
          });
        } catch (error) {
          if (error instanceof EmailAlreadyExistsError) {
            return reply.status(409).send({
              errorType: 'CONFLICT',
              message: error.message,
            });
          }
          throw error;
        }
      },
    );

    app.post(
      '/login',
      {
        schema: {
          tags: ['Auth'],
          body: loginSchema,
          response: {
            200: authResponseSchema,
            401: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const { email, password } = request.body;
          const user = await authConnector.verifyCredentials(email, password);

          const accessToken = signAccessToken(user.id);
          const refreshToken = generateRefreshToken();
          const tokenHash = hashToken(refreshToken);

          await authConnector.storeRefreshToken(user.id, tokenHash, getRefreshTokenExpiry());

          return reply.status(200).send({
            user: {
              id: user.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              age: user.age,
              createdAt: user.createdAt,
            },
            tokens: {
              accessToken,
              refreshToken,
              expiresIn: ACCESS_TOKEN_TTL_SECONDS,
            },
          });
        } catch (error) {
          if (error instanceof InvalidCredentialsError) {
            return reply.status(401).send({
              errorType: 'UNAUTHORIZED',
              message: error.message,
            });
          }
          throw error;
        }
      },
    );

    app.post(
      '/refresh',
      {
        schema: {
          tags: ['Auth'],
          body: refreshTokenSchema,
          response: {
            200: tokenResponseSchema,
            401: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const { refreshToken } = request.body;
          const tokenHash = hashToken(refreshToken);

          const record = await authConnector.verifyRefreshToken(tokenHash);

          await authConnector.revokeRefreshToken(tokenHash);

          const user = await authConnector.getUserById(record.userId);

          if (!user) {
            return reply.status(401).send({
              errorType: 'UNAUTHORIZED',
              message: 'User not found',
            });
          }

          const newAccessToken = signAccessToken(user.id);
          const newRefreshToken = generateRefreshToken();
          const newTokenHash = hashToken(newRefreshToken);

          await authConnector.storeRefreshToken(user.id, newTokenHash, getRefreshTokenExpiry());

          return reply.status(200).send({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            expiresIn: ACCESS_TOKEN_TTL_SECONDS,
          });
        } catch (error) {
          if (error instanceof InvalidRefreshTokenError) {
            return reply.status(401).send({
              errorType: 'UNAUTHORIZED',
              message: error.message,
            });
          }
          throw error;
        }
      },
    );

    app.post(
      '/logout',
      {
        schema: {
          tags: ['Auth'],
          body: refreshTokenSchema,
          response: {
            204: { type: 'null', description: 'Successfully logged out' },
          },
        },
      },
      async (request, reply) => {
        const { refreshToken } = request.body;
        const tokenHash = hashToken(refreshToken);

        // Best-effort revocation — don't fail if token is already invalid
        await authConnector.revokeRefreshToken(tokenHash).catch((error) => {
          app.log.warn({ error }, 'Failed to revoke refresh token during logout');
        });

        return reply.status(204).send();
      },
    );

    app.delete(
      '/account',
      {
        schema: {
          tags: ['Auth'],
          response: {
            204: { type: 'null', description: 'Account deleted' },
            401: errorResponseSchema,
          },
        },
        preHandler: [authenticate],
      },
      async (request, reply) => {
        const userId = request.userId;

        await authConnector.revokeAllUserTokens(userId);
        await authConnector.deleteUser(userId);

        return reply.status(204).send();
      },
    );

    app.get(
      '/me',
      {
        schema: {
          tags: ['Auth'],
          response: {
            200: userResponseSchema,
            401: errorResponseSchema,
          },
        },
        preHandler: [authenticate],
      },
      async (request, reply) => {
        const userId = request.userId;
        const user = await authConnector.getUserById(userId);

        if (!user) {
          return reply.status(401).send({
            errorType: 'UNAUTHORIZED',
            message: 'User not found',
          });
        }

        return reply.status(200).send({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          age: user.age,
          createdAt: user.createdAt,
        });
      },
    );
  };

export const authRoutes = createAuthRoutes(authConnector);
