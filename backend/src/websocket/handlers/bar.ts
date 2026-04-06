import { Socket, Server } from 'socket.io';
import { prisma } from '../../db/prisma/client';
import { logger } from '../../utils/logger';

/**
 * Registra os handlers de eventos do namespace /bar.
 * Role permitida: BAR
 */
export function registerBarHandlers(socket: Socket, io: Server) {
  const user = (socket as any).user;

  /**
   * Evento: bar:item-ready
   * Bar marca um item como pronto e notifica o garçom.
   */
  socket.on('bar:item-ready', async ({ orderItemId }: { orderItemId: string }) => {
    if (!orderItemId || typeof orderItemId !== 'string') {
      socket.emit('error', { message: 'orderItemId inválido' });
      return;
    }

    try {
      const item = await prisma.orderItem.update({
        where: { id: orderItemId },
        data: { status: 'READY', readyAt: new Date() },
        include: {
          order: { include: { table: true } },
          product: true,
        },
      });

      logger.info({ orderItemId, userId: user?.userId }, 'Item marcado como pronto pelo bar');

      // Notificar garçom do restaurante
      io.of('/waiter')
        .to(`restaurant:${user.restaurantId}`)
        .emit('waiter:item-ready-notification', {
          orderId: item.orderId,
          orderItemId: item.id,
          tableNumber: item.order.table.number,
          itemName: item.product.name,
          waiterId: item.order.waiterId,
        });

      socket.emit('bar:item-ready-ack', { orderItemId, status: 'READY' });
    } catch (err) {
      logger.error({ err, orderItemId }, 'Erro ao marcar item como pronto (bar)');
      socket.emit('error', { message: 'Erro ao atualizar item' });
    }
  });
}
