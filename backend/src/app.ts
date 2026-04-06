import Fastify, { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { authRoutes } from './routes/auth';
import { ordersRoutes } from './routes/orders';
import { productsRoutes } from './routes/products';
import { tablesRoutes } from './routes/tables';
import { dashboardRoutes } from './routes/dashboard';
import { workersRoutes } from './routes/dashboard/workers';
import { brindeRoutes } from './routes/dashboard/brinde';
import { registerSecurity } from './middleware/security';
import { registerRateLimit } from './middleware/rateLimit';
import { setupWebSocket } from './websocket/rooms';
import { setupAdapter } from './websocket/adapter';
import { initNotificationService } from './services/notificationService';
import { AppError } from './utils/errors';

interface BuildAppOptions {
  testMode?: boolean;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const fastify = Fastify({
    // Usar logger nativo do Fastify (pino integrado) em vez de instância externa
    logger: opts.testMode
      ? false
      : {
          level: process.env.LOG_LEVEL || 'info',
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          transport:
            process.env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { colorize: true } }
              : undefined,
        },
    trustProxy: true,
    bodyLimit: 1024 * 100,
  });

  // --- Segurança (helmet, cors, cookie) ---
  await registerSecurity(fastify);

  // --- Rate limiting ---
  await registerRateLimit(fastify);

  // --- Tratamento global de erros ---
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ message: error.message });
    }
    if (error.statusCode === 400) {
      return reply.status(400).send({ message: 'Dados inválidos', detail: error.message });
    }
    fastify.log.error({ err: error, url: request.url }, 'Erro interno não tratado');
    return reply.status(500).send({ message: 'Erro interno do servidor' });
  });

  // --- Rotas de autenticação ---
  fastify.register(authRoutes, { prefix: '/api/auth' });

  // --- Rotas de comandas ---
  fastify.register(ordersRoutes, { prefix: '/api/orders' });

  // --- Rotas do dono ---
  fastify.register(
    async (owner) => {
      owner.register(productsRoutes, { prefix: '/products' });
      owner.register(dashboardRoutes, { prefix: '/dashboard' });
      owner.register(workersRoutes, { prefix: '/workers' });
      owner.register(brindeRoutes, { prefix: '/brinde' });
    },
    { prefix: '/api/owner' }
  );

  // --- Rotas de restaurante (mesas + produtos por restaurante) ---
  fastify.register(tablesRoutes, { prefix: '/api/restaurants' });
  fastify.register(
    async (scope) => {
      scope.register(productsRoutes, { prefix: '/:restaurantId/products' });
    },
    { prefix: '/api/restaurants' }
  );

  // Health check
  fastify.get('/health', async () => ({ status: 'ok' }));

  // --- WebSocket ---
  if (!opts.testMode) {
    await fastify.ready();
    const io = new Server(fastify.server, {
      path: process.env.SOCKET_PATH || '/socket.io',
      cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3001'],
        credentials: true,
      },
    });
    (fastify as any).io = io;
    setupAdapter(io);
    setupWebSocket(io);
    initNotificationService(io);
  }

  return fastify;
}
