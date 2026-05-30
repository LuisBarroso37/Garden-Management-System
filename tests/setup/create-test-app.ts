import Fastify, { type FastifyError, type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import {
  fastifyZodOpenApiPlugin,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-zod-openapi';

interface RouteRegistration {
  plugin: FastifyPluginAsync;
  prefix: string;
}

export const createTestApp = async (routes: RouteRegistration[]): Promise<FastifyInstance> => {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(fastifyZodOpenApiPlugin);

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.validation) {
      return reply.status(400).send({
        errorType: 'VALIDATION_ERROR',
        message: error.message,
      });
    }
    return reply.status(error.statusCode ?? 500).send({
      errorType: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });

  for (const { plugin, prefix } of routes) {
    await app.register(plugin, { prefix });
  }

  await app.ready();
  return app;
};
