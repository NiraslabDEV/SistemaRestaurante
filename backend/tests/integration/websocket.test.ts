import { setupTestApp, seedRestaurant, generateJWT } from '../setup';
import { io as ioc } from 'socket.io-client';

// Estes testes requerem o servidor rodando na porta 3000
// Executar com: NODE_ENV=test jest tests/integration/websocket.test.ts

describe('WebSocket (socket.io)', () => {
  let seed: any;
  let waiterToken: string;
  let kitchenToken: string;
  let barToken: string;
  let serverPort: number;

  beforeEach(async () => {
    const app = await setupTestApp();
    serverPort = (app.server.address() as any)?.port || 3000;
    seed = await seedRestaurant();
    waiterToken = generateJWT(seed.waiter);
    kitchenToken = generateJWT(seed.kitchen);
    barToken = generateJWT(seed.bar);
  });

  const connect = (namespace: string, token?: string) =>
    ioc(`http://localhost:${serverPort}${namespace}`, {
      transports: ['websocket'],
      ...(token ? { auth: { token } } : {}),
    });

  it('deve conectar garçom ao namespace /waiter com token válido', done => {
    const socket = connect('/waiter', waiterToken);

    socket.on('connect', () => {
      expect(socket.connected).toBe(true);
      socket.disconnect();
      done();
    });

    socket.on('connect_error', (err: Error) => {
      done(new Error(`Falha ao conectar garçom: ${err.message}`));
    });
  });

  it('deve conectar cozinha ao namespace /kitchen com token válido', done => {
    const socket = connect('/kitchen', kitchenToken);

    socket.on('connect', () => {
      expect(socket.connected).toBe(true);
      socket.disconnect();
      done();
    });

    socket.on('connect_error', (err: Error) => {
      done(new Error(`Falha ao conectar cozinha: ${err.message}`));
    });
  });

  it('deve conectar bar ao namespace /bar com token válido', done => {
    const socket = connect('/bar', barToken);

    socket.on('connect', () => {
      expect(socket.connected).toBe(true);
      socket.disconnect();
      done();
    });

    socket.on('connect_error', (err: Error) => {
      done(new Error(`Falha ao conectar bar: ${err.message}`));
    });
  });

  it('deve rejeitar conexão ao namespace /waiter sem token', done => {
    const socket = connect('/waiter'); // sem auth

    socket.on('connect_error', () => {
      done(); // esperado
    });

    socket.on('connect', () => {
      socket.disconnect();
      done(new Error('Não deveria conectar sem token'));
    });
  });

  it('deve rejeitar conexão ao namespace /kitchen sem token', done => {
    const socket = connect('/kitchen');

    socket.on('connect_error', () => {
      done();
    });

    socket.on('connect', () => {
      socket.disconnect();
      done(new Error('Não deveria conectar sem token'));
    });
  });

  it('deve rejeitar conexão ao namespace /bar com token de garçom (role errado)', done => {
    // Garçom não pode se conectar ao namespace /bar
    const socket = connect('/bar', waiterToken);

    socket.on('connect_error', () => {
      done();
    });

    socket.on('connect', () => {
      socket.disconnect();
      done(new Error('Garçom não deveria conectar ao namespace /bar'));
    });
  });
});
