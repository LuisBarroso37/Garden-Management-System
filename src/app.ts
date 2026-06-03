import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyEtag from '@fastify/etag';
import {
  fastifyZodOpenApiPlugin,
  fastifyZodOpenApiTransformers,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-zod-openapi';
import type { Config } from './config.js';
import type { FastifyError } from 'fastify';
import { gardenRoutes } from './routes/gardens.js';
import { plantRoutes } from './routes/plants.js';
import { irrigationRoutes } from './routes/irrigation.js';
import { reportRoutes } from './routes/report.js';
import { authRoutes } from './routes/auth.js';
import { logMutationRequest } from './utils/request-logger.js';

export async function buildApp(config: Config) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === 'development' && {
        transport: { target: 'pino-pretty' },
      }),
    },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifyZodOpenApiPlugin);

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: config.NODE_ENV === 'production',
  });

  await app.register(fastifyCors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(','),
  });

  await app.register(fastifyEtag);

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Garden Management System',
        description: 'Automated garden management API',
        version: '1.0.0',
      },
    },
    ...fastifyZodOpenApiTransformers,
  });

  if (config.NODE_ENV !== 'production') {
    const { default: fastifySwaggerUi } = await import('@fastify/swagger-ui');
    await app.register(fastifySwaggerUi, { routePrefix: '/docs' });
  }

  app.get('/health-check', { schema: { tags: ['System'] } }, async (_request, reply) => {
    reply.status(200).send({ status: 'ok' });
  });

  app.addHook('preHandler', (request, _reply, done) => {
    logMutationRequest(request);
    done();
  });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.validation) {
      return reply.status(400).send({
        errorType: 'VALIDATION_ERROR',
        message: error.message,
      });
    }

    app.log.error(error);

    return reply.status(error.statusCode ?? 500).send({
      errorType: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });

  await app.register(gardenRoutes, { prefix: '/api/gardens' });
  await app.register(plantRoutes, { prefix: '/api/gardens/:gardenId/plants' });
  await app.register(irrigationRoutes, { prefix: '/api/irrigation' });
  await app.register(reportRoutes, { prefix: '/api/reports' });
  await app.register(authRoutes, { prefix: '/api/auth' });

  return app;
}
