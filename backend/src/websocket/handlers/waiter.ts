import { Socket } from 'socket.io';
import { prisma } from '../../db/prisma/client';
import { logger } from '../../utils/logger';

/**
 * Registra os handlers de eventos do namespace /waiter.
 * Role permitida: WAITER
 */
export function registerWaiterHandlers(socket: Socket) {
  const user = (socket as any).user;

  /**
   * Evento: waiter:item-delivered
   * Garçom confirma que entregou o item na mesa.
   */
  socket.on('waiter:item-delivered', async ({ orderItemId }: { orderItemId: string }) => {
    if (!orderItemId || typeof orderItemId !== 'string') {
      socket.emit('error', { message: 'orderItemId inválido' });
      return;
    }

    try {
      const item = await prisma.orderItem.update({
        where: { id: orderItemId },
        data: { status: 'DELIVERED', deliveredAt: new Date() },
        include: { order: true },
      });

      // Apenas o garçom dono da comanda pode marcar entregue
      if (item.order.waiterId !== user.userId) {
        socket.emit('error', { message: 'Acesso negado' });
        return;
      }

      logger.info({ orderItemId, userId: user?.userId }, 'Item marcado como entregue pelo garçom');

      socket.emit('waiter:item-delivered-ack', { orderItemId, status: 'DELIVERED' });
    } catch (err) {
      logger.error({ err, orderItemId }, 'Erro ao marcar item como entregue');
      socket.emit('error', { message: 'Erro ao atualizar item' });
    }
  });
}
