import { FastifyInstance } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';

/**
 * Registra rate limiting diferenciado por tipo de rota:
 * - Rotas de autenticação: 50 req / 15 min (mais restritivo)
 * - Rotas autenticadas: 500 req / 15 min
 * - Rotas públicas gerais: 100 req / 15 min
 */
export async function registerRateLimit(fastify: FastifyInstance) {
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
  const maxPublic = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);

  await fastify.register(fastifyRateLimit, {
    global: true,
    max: maxPublic,
    timeWindow: windowMs,
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      message: `Muitas requisições. Tente novamente em ${Math.ceil(context.ttl / 1000)} segundos.`,
      retryAfter: Math.ceil(context.ttl / 1000),
    }),
  });
}

/** Config de rate limit para rotas de autenticação (mais restritivo) */
export const authRateLimitConfig = {
  config: {
    rateLimit: {
      max: 50,
      timeWindow: '15 minutes',
    },
  },
};

/** Config de rate limit para rotas autenticadas (mais permissivo) */
export const authenticatedRateLimitConfig = {
  config: {
    rateLimit: {
      max: 500,
      timeWindow: '15 minutes',
    },
  },
};
