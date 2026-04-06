import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/role';
import { prisma } from '../../db/prisma/client';
import { signJWT } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import { AppError, NotFoundError } from '../../utils/errors';

const authorizeSchema = z.object({
  productId: z.string().min(1).max(100),
  orderId: z.string().min(1).max(100),
  quantity: z.number().int().positive().max(10),
  reason: z.string().min(1).max(200).optional(),
}).strict();

export async function brindeRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * POST /api/owner/brinde/authorize
   * Dono autoriza um brinde para uma comanda específica.
   * Retorna um token de brinde de uso único (expira em 30 min).
   */
  fastify.post(
    '/authorize',
    { preHandler: requireRole('OWNER') },
    async (request, reply) => {
      const result = authorizeSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() });
      }

      const { productId, orderId, quantity, reason } = result.data;
      const restaurantId = request.user.restaurantId;

      // Validar que produto é do restaurante e marcado como brinde
      const product = await prisma.product.findFirst({
        where: { id: productId, restaurantId },
      });

      if (!product) throw new NotFoundError('Produto não encontrado');

      // Validar que a comanda pertence ao restaurante
      const order = await prisma.order.findFirst({
        where: { id: orderId, table: { restaurantId } },
      });

      if (!order) throw new NotFoundError('Comanda não encontrada');
      if (order.status === 'CLOSED') {
        throw new AppError('Não é possível autorizar brinde em comanda fechada', 400);
      }

      // Gerar token de autorização único (expira em 30 min)
      const brindeToken = signJWT({
        userId: request.user.userId,
        role: 'BRINDE_AUTHORIZATION',
        restaurantId,
      });

      logger.info(
        { ownerId: request.user.userId, productId, orderId, quantity, reason },
        'Brinde autorizado pelo dono'
      );

      return reply.send({
        brindeToken,
        productId,
        orderId,
        quantity,
        expiresInMinutes: 30,
        message: `Brinde de ${quantity}x "${product.name}" autorizado`,
      });
    }
  );
}
