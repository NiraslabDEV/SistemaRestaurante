import { Socket, Server } from 'socket.io';
import { prisma } from '../../db/prisma/client';
import { logger } from '../../utils/logger';

/**
 * Registra os handlers de eventos do namespace /kitchen.
 * Role permitida: KITCHEN
 */
export function registerKitchenHandlers(socket: Socket, io: Server) {
  const user = (socket as any).user;

  /**
   * Evento: kitchen:item-ready
   * Cozinha marca um item como pronto e notifica o garçom.
   */
  socket.on('kitchen:item-ready', async ({ orderItemId }: { orderItemId: string }) => {
    if (!orderItemId || typeof orderItemId !== 'string') {
      socket.emit('error', { message: 'orderItemId inválido' });
      return;
    }

    try {
      const item = await prisma.orderItem.update({
        where: { id: orderItemId },
        data: { status: 'READY', readyAt: new Date() },
        include: {
          order: { include: { table: true, waiter: true } },
          product: true,
        },
      });

      logger.info({ orderItemId, userId: user?.userId }, 'Item marcado como pronto pela cozinha');

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

      // Confirmar para a cozinha
      socket.emit('kitchen:item-ready-ack', { orderItemId, status: 'READY' });
    } catch (err) {
      logger.error({ err, orderItemId }, 'Erro ao marcar item como pronto (cozinha)');
      socket.emit('error', { message: 'Erro ao atualizar item' });
    }
  });
}
