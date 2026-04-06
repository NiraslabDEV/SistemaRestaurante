import { Server } from 'socket.io';
import { logger } from '../utils/logger';

/**
 * Serviço centralizado de notificações via WebSocket.
 * Encapsula todos os emits para evitar acoplamento direto nas rotas.
 */
export class NotificationService {
  constructor(private readonly io: Server) {}

  /** Notifica a cozinha sobre novo pedido de comida */
  notifyKitchen(restaurantId: string, payload: {
    orderId: string;
    tableNumber: number;
    items: Array<{ id: string; productName: string; quantity: number; observation?: string | null }>;
    createdAt: Date;
  }) {
    this.io.of('/kitchen')
      .to(`restaurant:${restaurantId}`)
      .emit('kitchen:new-order', payload);

    logger.info({ orderId: payload.orderId, restaurantId }, 'Notificação enviada para cozinha');
  }

  /** Notifica o bar sobre novo pedido de bebida */
  notifyBar(restaurantId: string, payload: {
    orderId: string;
    tableNumber: number;
    items: Array<{ id: string; productName: string; quantity: number }>;
  }) {
    this.io.of('/bar')
      .to(`restaurant:${restaurantId}`)
      .emit('bar:new-order', payload);

    logger.info({ orderId: payload.orderId, restaurantId }, 'Notificação enviada para o bar');
  }

  /** Notifica o garçom que um item está pronto */
  notifyWaiterItemReady(restaurantId: string, payload: {
    orderId: string;
    orderItemId: string;
    tableNumber: number;
    itemName: string;
    waiterId: string;
  }) {
    this.io.of('/waiter')
      .to(`restaurant:${restaurantId}`)
      .emit('waiter:item-ready-notification', payload);

    logger.info({ orderItemId: payload.orderItemId, restaurantId }, 'Garçom notificado sobre item pronto');
  }

  /** Notifica o dono sobre comanda fechada */
  notifyOwnerOrderCompleted(restaurantId: string, payload: {
    orderId: string;
    total: number;
    waiterName: string;
    tableNumber: number;
  }) {
    this.io.of('/owner')
      .to(`restaurant:${restaurantId}`)
      .emit('owner:order-completed', payload);
  }
}

/** Instância singleton — inicializada após o servidor subir */
let instance: NotificationService | null = null;

export function initNotificationService(io: Server) {
  instance = new NotificationService(io);
}

export function getNotificationService(): NotificationService | null {
  return instance;
}
