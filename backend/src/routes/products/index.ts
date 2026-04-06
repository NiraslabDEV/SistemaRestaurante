import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/role';
import { prisma } from '../../db/prisma/client';
import { AppError, NotFoundError } from '../../utils/errors';
import xss from 'xss';

const productSchema = z.object({
  name: z.string().min(1).max(100),
  price: z.number().positive('Preço deve ser maior que zero'),
  category: z.enum(['FOOD', 'DRINK', 'DESSERT']),
  available: z.boolean().optional().default(true),
  allergens: z.array(z.string()).optional().default([]),
  isBrindeOnly: z.boolean().optional().default(false),
}).strict();

export async function productsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // GET /api/restaurants/:restaurantId/products — qualquer role autenticado
  fastify.get('/', async (request, reply) => {
    const { category } = request.query as { category?: string };
    const { restaurantId } = request.user;

    const products = await prisma.product.findMany({
      where: {
        restaurantId,
        ...(category ? { category: category as any } : {}),
        available: true,
      },
      orderBy: { name: 'asc' },
    });

    return reply.send({ products });
  });

  // POST /api/owner/products — apenas OWNER
  fastify.post('/', { preHandler: requireRole('OWNER') }, async (request, reply) => {
    const result = productSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() });
    }

    const data = result.data;

    const product = await prisma.product.create({
      data: {
        name: xss(data.name),
        price: data.price,
        category: data.category,
        available: data.available,
        allergens: data.allergens,
        isBrindeOnly: data.isBrindeOnly,
        restaurantId: request.user.restaurantId,
      },
    });

    return reply.status(201).send({ product });
  });

  // PUT /api/owner/products/:id — apenas OWNER
  fastify.put('/:id', { preHandler: requireRole('OWNER') }, async (request, reply) => {
    const result = productSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() });
    }

    const { id } = request.params as { id: string };

    // Verificar que o produto pertence ao restaurante do dono (proteção IDOR)
    const existing = await prisma.product.findFirst({
      where: { id, restaurantId: request.user.restaurantId },
    });

    if (!existing) throw new NotFoundError('Produto não encontrado');

    const data = result.data;
    const product = await prisma.product.update({
      where: { id },
      data: {
        name: xss(data.name),
        price: data.price,
        category: data.category,
        available: data.available,
        allergens: data.allergens,
        isBrindeOnly: data.isBrindeOnly,
      },
    });

    return reply.send({ product });
  });

  // DELETE /api/owner/products/:id — apenas OWNER
  fastify.delete('/:id', { preHandler: requireRole('OWNER') }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.product.findFirst({
      where: { id, restaurantId: request.user.restaurantId },
    });

    if (!existing) throw new NotFoundError('Produto não encontrado');

    await prisma.product.delete({ where: { id } });

    return reply.send({ message: 'Produto removido' });
  });
}
