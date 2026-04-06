import { Server, Socket } from 'socket.io';
import { verifyJWT } from '../utils/crypto';
import { logger } from '../utils/logger';
import { registerKitchenHandlers } from './handlers/kitchen';
import { registerBarHandlers } from './handlers/bar';
import { registerWaiterHandlers } from './handlers/waiter';

type Role = 'WAITER' | 'KITCHEN' | 'BAR' | 'OWNER';

const NAMESPACE_ROLES: Record<string, Role[]> = {
  '/waiter':  ['WAITER'],
  '/kitchen': ['KITCHEN'],
  '/bar':     ['BAR'],
  '/owner':   ['OWNER'],
};

function createAuthMiddleware(allowedRoles: Role[]) {
  return (socket: Socket, next: (err?: Error) => void) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      logger.warn({ socketId: socket.id }, 'WebSocket: conexão sem token rejeitada');
      return next(new Error('Autenticação necessária'));
    }

    try {
      const payload = verifyJWT(token);

      if (!allowedRoles.includes(payload.role as Role)) {
        logger.warn(
          { socketId: socket.id, role: payload.role, allowedRoles },
          'WebSocket: role não autorizado para este namespace'
        );
        return next(new Error('Role não autorizado'));
      }

      (socket as any).user = payload;
      next();
    } catch {
      logger.warn({ socketId: socket.id }, 'WebSocket: token inválido ou expirado');
      next(new Error('Token inválido'));
    }
  };
}

export function setupWebSocket(io: Server) {
  for (const [namespace, roles] of Object.entries(NAMESPACE_ROLES)) {
    const nsp = io.of(namespace);
    nsp.use(createAuthMiddleware(roles));

    nsp.on('connection', socket => {
      const user = (socket as any).user;
      logger.info(
        { namespace, userId: user?.userId, role: user?.role },
        'WebSocket conectado'
      );

      // Entrar na sala do restaurante para broadcasts segmentados
      socket.join(`restaurant:${user.restaurantId}`);

      // Registrar handlers específicos de cada namespace
      if (namespace === '/waiter')  registerWaiterHandlers(socket);
      if (namespace === '/kitchen') registerKitchenHandlers(socket, io);
      if (namespace === '/bar')     registerBarHandlers(socket, io);

      socket.on('disconnect', () => {
        logger.info(
          { namespace, userId: user?.userId },
          'WebSocket desconectado'
        );
      });
    });
  }
}
