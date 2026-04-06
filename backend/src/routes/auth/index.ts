import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma/client';
import { comparePassword, signJWT } from '../../utils/crypto';
import { authMiddleware } from '../../middleware/auth';
import { logger } from '../../utils/logger';

const waiterLoginSchema = z.object({
  pin: z.string().min(1).max(20).regex(/^\d+$/, 'PIN deve conter apenas dígitos'),
  waiterId: z.string().min(1).max(100),
});

const ownerLoginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1).max(200),
});

export async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/waiter/login
  fastify.post('/waiter/login', async (request, reply) => {
    const result = waiterLoginSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() });
    }

    const { pin, waiterId } = result.data;

    // Mensagem genérica — nunca revelar se o erro é no PIN ou no ID
    const GENERIC_ERROR = 'Credenciais inválidas';

    const user = await prisma.user.findFirst({
      where: {
        id: waiterId,
        role: { in: ['WAITER', 'KITCHEN', 'BAR'] },
      },
    });

    if (!user || !user.pin) {
      // Simular bcrypt compare para evitar timing attack
      await comparePassword(pin, '$2b$10$invalidHashForTimingAttack00000000000000000000000');
      return reply.status(401).send({ message: GENERIC_ERROR });
    }

    const valid = await comparePassword(pin, user.pin);
    if (!valid) {
      logger.warn({ waiterId }, 'Tentativa de login com PIN inválido');
      return reply.status(401).send({ message: GENERIC_ERROR });
    }

    const token = signJWT({ userId: user.id, role: user.role, restaurantId: user.restaurantId });

    logger.info({ userId: user.id, role: user.role }, 'Login de operador realizado');

    reply.setCookie('token', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60, // 8 horas
      path: '/',
    });

    return reply.send({ token, role: user.role, name: user.name });
  });

  // POST /api/auth/owner/login
  fastify.post('/owner/login', async (request, reply) => {
    const result = ownerLoginSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() });
    }

    const { email, password } = result.data;
    const GENERIC_ERROR = 'Credenciais inválidas';

    const user = await prisma.user.findFirst({
      where: { email, role: 'OWNER' },
    });

    if (!user || !user.password) {
      await comparePassword(password, '$2b$10$invalidHashForTimingAttack00000000000000000000000');
      return reply.status(401).send({ message: GENERIC_ERROR });
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      logger.warn({ email }, 'Tentativa de login de dono com senha inválida');
      return reply.status(401).send({ message: GENERIC_ERROR });
    }

    const token = signJWT({ userId: user.id, role: user.role, restaurantId: user.restaurantId });

    logger.info({ userId: user.id }, 'Login de dono realizado');

    reply.setCookie('token', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60,
      path: '/',
    });

    return reply.send({ token, role: user.role, name: user.name });
  });

  // POST /api/auth/logout
  fastify.post('/logout', { preHandler: authMiddleware }, async (request, reply) => {
    reply.setCookie('token', '', {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 0,
      path: '/',
    });

    logger.info({ userId: request.user?.userId }, 'Logout realizado');
    return reply.send({ message: 'Logout realizado com sucesso' });
  });
}
