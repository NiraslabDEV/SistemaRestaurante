import { FastifyInstance } from 'fastify';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';

/**
 * Registra todos os middlewares de segurança:
 * - Helmet (headers HTTP de segurança)
 * - CORS (origens permitidas via env)
 * - Cookie parser (para JWT httpOnly)
 */
export async function registerSecurity(fastify: FastifyInstance) {
  // Headers de segurança HTTP
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: false, // API REST — sem HTML
    crossOriginEmbedderPolicy: false,
  });

  // CORS — apenas origens explicitamente permitidas
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3001')
    .split(',')
    .map(o => o.trim());

  await fastify.register(fastifyCors, {
    origin: allowedOrigins,
    credentials: true, // necessário para enviar cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Cookie parser — necessário para ler JWT em cookie httpOnly
  await fastify.register(fastifyCookie);
}
