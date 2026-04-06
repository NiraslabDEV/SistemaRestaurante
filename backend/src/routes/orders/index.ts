import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/role';
import {
  createOrder,
  addItemToOrder,
  sendOrder,
  closeOrder,
  addPostCloseItem,
} from '../../services/orderService';
import { AppError } from '../../utils/errors';

const createOrderSchema = z.object({
  tableId: z.string().min(1).max(100),
  waiterId: z.string().min(1).max(100),
}).strict(); // rejeitar campos extras

const addItemSchema = z.object({
  productId: z.string().min(1).max(100),
  quantity: z.number().int().positive('Quantidade deve ser maior que zero'),
  observation: z.string().max(500).optional(),
}).strict();

const closeOrderSchema = z.object({
  split: z.array(
    z.object({
      guestName: z.string().max(100).optional(),
      amount: z.number().positive('Valor deve ser positivo'),
    })
  ).optional(),
}).strict().optional();

const postCloseSchema = z.object({
  productId: z.string().min(1).max(100),
  quantity: z.number().int().positive(),
}).strict();

export async function ordersRoutes(fastify: FastifyInstance) {
  // Todas as rotas de orders exigem autenticação
  fastify.addHook('preHandler', authMiddleware);

  // POST /api/orders — criar comanda (apenas WAITER)
  fastify.post('/', { preHandler: requireRole('WAITER') }, async (request, reply) => {
    const result = createOrderSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() });
    }

    try {
      const order = await createOrder(
        result.data.tableId,
        result.data.waiterId,
        request.user.restaurantId
      );
      return reply.status(201).send({ order });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ message: err.message });
      }
      throw err;
    }
  });

  // POST /api/orders/:id/items — adicionar item (apenas WAITER)
  fastify.post('/:id/items', { preHandler: requireRole('WAITER') }, async (request, reply) => {
    const result = addItemSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() });
    }

    const { id } = request.params as { id: string };

    try {
      const item = await addItemToOrder(
        id,
        result.data.productId,
        result.data.quantity,
        result.data.observation,
        request.user.userId
      );
      return reply.status(201).send({ item });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ message: err.message });
      }
      throw err;
    }
  });

  // POST /api/orders/:id/send — enviar pedido (apenas WAITER)
  fastify.post('/:id/send', { preHandler: requireRole('WAITER') }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const order = await sendOrder(id, request.user.userId);

      // Emitir evento WebSocket (se disponível)
      const io = (fastify as any).io;
      if (io) {
        const kitchenItems = order.items.filter((i: { destination: string }) => i.destination === 'KITCHEN');
        const barItems = order.items.filter((i: { destination: string }) => i.destination === 'BAR');

        if (kitchenItems.length > 0) {
          io.of('/kitchen').emit('kitchen:new-order', {
            orderId: order.id,
            tableNumber: (order as any).table?.number,
            items: kitchenItems,
            createdAt: order.createdAt,
          });
        }

        if (barItems.length > 0) {
          io.of('/bar').emit('bar:new-order', {
            orderId: order.id,
            tableNumber: (order as any).table?.number,
            items: barItems,
          });
        }
      }

      return reply.send({ order });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ message: err.message });
      }
      throw err;
    }
  });

  // POST /api/orders/:id/close — fechar conta (apenas WAITER)
  fastify.post('/:id/close', { preHandler: requireRole('WAITER') }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const parsed = closeOrderSchema?.safeParse(request.body);
    const split = parsed?.success ? parsed.data?.split : undefined;

    if (parsed && !parsed.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: parsed.error.flatten() });
    }

    try {
      const result = await closeOrder(id, request.user.userId, split);
      return reply.send(result);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ message: err.message });
      }
      throw err;
    }
  });

  // POST /api/orders/:id/post-close — saideira (apenas WAITER)
  fastify.post('/:id/post-close', { preHandler: requireRole('WAITER') }, async (request, reply) => {
    const result = postCloseSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() });
    }

    const { id } = request.params as { id: string };

    try {
      const item = await addPostCloseItem(
        id,
        result.data.productId,
        result.data.quantity,
        request.user.userId
      );
      return reply.status(201).send(item);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ message: err.message });
      }
      throw err;
    }
  });
}
