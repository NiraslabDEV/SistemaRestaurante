import { io as ioc, Socket } from 'socket.io-client';

/**
 * Cria um cliente socket.io para testes.
 * @param port   Porta do servidor (obtida via app.server.address())
 * @param namespace  Ex: '/waiter', '/kitchen', '/bar', '/owner'
 * @param token  JWT — omitir para testar conexão sem autenticação
 */
export function createTestSocket(port: number, namespace: string, token?: string): Socket {
  return ioc(`http://localhost:${port}${namespace}`, {
    transports: ['websocket'],
    ...(token ? { auth: { token } } : {}),
    reconnection: false,
  });
}

/**
 * Aguarda que o socket conecte com sucesso.
 * Rejeita após `timeoutMs` ms.
 */
export function waitForConnect(socket: Socket, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timeout aguardando conexão WebSocket'));
    }, timeoutMs);

    socket.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });

    socket.on('connect_error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Aguarda que o socket falhe ao conectar.
 * Rejeita após `timeoutMs` ms (se conectar sem erro, também rejeita).
 */
export function waitForConnectError(socket: Socket, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timeout — socket conectou quando deveria falhar'));
    }, timeoutMs);

    socket.on('connect_error', () => {
      clearTimeout(timer);
      resolve();
    });

    socket.on('connect', () => {
      clearTimeout(timer);
      socket.disconnect();
      reject(new Error('Socket conectou quando deveria ter sido rejeitado'));
    });
  });
}

/**
 * Aguarda um evento específico no socket.
 */
export function waitForEvent<T = unknown>(
  socket: Socket,
  event: string,
  timeoutMs = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout aguardando evento "${event}"`));
    }, timeoutMs);

    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}
