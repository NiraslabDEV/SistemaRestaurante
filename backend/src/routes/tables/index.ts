import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/role';
import { prisma } from '../../db/prisma/client';
import { ForbiddenError } from '../../utils/errors';

const tableSchema = z.object({
  number: z.number().int().positive(),
}).strict();

export async function tablesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // GET /api/restaurants/:restaurantId/tables
  fastify.get('/:restaurantId/tables', async (request, reply) => {
    const { restaurantId } = request.params as { restaurantId: string };

    // Proteção IDOR: só pode listar mesas do próprio restaurante
    if (request.user.restaurantId !== restaurantId) {
      throw new ForbiddenError('Acesso negado a este restaurante');
    }

    const tables = await prisma.table.findMany({
      where: { restaurantId },
      orderBy: { number: 'asc' },
    });

    return reply.send({ tables });
  });

  // POST /api/owner/tables — apenas OWNER
  fastify.post('/', { preHandler: requireRole('OWNER') }, async (request, reply) => {
    const result = tableSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() });
    }

    const table = await prisma.table.create({
      data: {
        number: result.data.number,
        restaurantId: request.user.restaurantId,
      },
    });

    return reply.status(201).send({ table });
  });
}
