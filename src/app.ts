import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import {
  fastifyZodOpenApiPlugin,
  fastifyZodOpenApiTransformers,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-zod-openapi';
import type { Config } from './config.js';
import { gardenRoutes } from './routes/gardens.js';
import { plantRoutes } from './routes/plants.js';

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
    reply.status(200).send();
  });

  await app.register(gardenRoutes, { prefix: '/api/gardens' });
  await app.register(plantRoutes, { prefix: '/api/gardens/:gardenId/plants' });

  return app;
}
