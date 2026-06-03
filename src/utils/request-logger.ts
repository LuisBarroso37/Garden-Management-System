import type { FastifyRequest } from 'fastify';

const SENSITIVE_KEYS = new Set(['password', 'token', 'refreshToken', 'accessToken']);
const REDACTED_HEADERS = new Set(['authorization', 'cookie']);
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) =>
        SENSITIVE_KEYS.has(key) ? [key, '[REDACTED]'] : [key, sanitize(v)],
      ),
    );
  }
  return value;
}

function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) =>
      REDACTED_HEADERS.has(key) ? [key, '[REDACTED]'] : [key, value],
    ),
  );
}

export function logMutationRequest(request: FastifyRequest): void {
  if (request.url === '/health-check') {
    return;
  }

  if (!MUTATION_METHODS.has(request.method)) {
    return;
  }

  const headers = redactHeaders(request.headers);

  if (request.body) {
    request.log.info({ headers, body: sanitize(request.body) }, 'incoming request');
  } else {
    request.log.info({ headers }, 'incoming request');
  }
}
