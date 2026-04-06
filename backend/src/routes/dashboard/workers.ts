import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/role';
import { prisma } from '../../db/prisma/client';
import { hashPassword } from '../../utils/crypto';
import { NotFoundError } from '../../utils/errors';

const workerSchema = z.object({
  name: z.string().min(1).max(100),
  pin: z.string().min(4).max(20).regex(/^\d+$/, 'PIN deve conter apenas dígitos'),
  role: z.enum(['WAITER', 'KITCHEN', 'BAR']),
}).strict();

export async function workersRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', requireRole('OWNER'));

  // GET /api/owner/workers
  fastify.get('/', async (request, reply) => {
    const workers = await prisma.user.findMany({
      where: {
        restaurantId: request.user.restaurantId,
        role: { in: ['WAITER', 'KITCHEN', 'BAR'] },
      },
      select: { id: true, name: true, role: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    return reply.send({ workers });
  });

  // POST /api/owner/workers
  fastify.post('/', async (request, reply) => {
    const result = workerSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() });
    }

    const { name, pin, role } = result.data;
    const hashedPin = await hashPassword(pin);

    const worker = await prisma.user.create({
      data: {
        name,
        pin: hashedPin,
        role,
        restaurantId: request.user.restaurantId,
      },
      select: { id: true, name: true, role: true, createdAt: true },
    });

    return reply.status(201).send({ worker });
  });

  // DELETE /api/owner/workers/:id
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Proteção IDOR: garantir que o worker pertence ao restaurante do dono
    const worker = await prisma.user.findFirst({
      where: {
        id,
        restaurantId: request.user.restaurantId,
        role: { in: ['WAITER', 'KITCHEN', 'BAR'] },
      },
    });

    if (!worker) throw new NotFoundError('Funcionário não encontrado');

    await prisma.user.delete({ where: { id } });
    return reply.send({ message: 'Funcionário removido' });
  });
}
