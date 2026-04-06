import { Server } from 'socket.io';
import { logger } from '../utils/logger';

/**
 * Configura o adapter do socket.io.
 *
 * Atualmente usa o adapter in-memory (padrão).
 * Para múltiplas instâncias (escala horizontal), trocar por @socket.io/redis-adapter:
 *
 * ```ts
 * import { createAdapter } from '@socket.io/redis-adapter';
 * import { createClient } from 'redis';
 *
 * const pubClient = createClient({ url: process.env.REDIS_URL });
 * const subClient = pubClient.duplicate();
 * await Promise.all([pubClient.connect(), subClient.connect()]);
 * io.adapter(createAdapter(pubClient, subClient));
 * ```
 */
export function setupAdapter(io: Server) {
  // Adapter in-memory — adequado para instância única (Oracle Free Tier)
  logger.info('WebSocket usando adapter in-memory (single instance)');

  // Monitorar conexões
  io.on('new_namespace', (namespace) => {
    logger.info({ namespace: namespace.name }, 'Novo namespace WebSocket criado');
  });
}
