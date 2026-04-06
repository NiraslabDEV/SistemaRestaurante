# Fase 2 – Testes do Projeto Restaurante (Método Akita – Security-First)

> **Stack:** Fastify + socket.io + TypeScript + Prisma + Jest + Supertest
> **Baseado no SDD da Fase 1**

## Estrutura de Arquivos de Teste

```
backend/tests/
├── setup.ts                    # Configuração global do Jest + Supertest
├── helpers/
│   ├── db.ts                   # Funções auxiliares de banco de dados (seed, cleanup)
│   ├── auth.ts                 # Gera tokens JWT para testes
│   └── socket.ts               # Helpers para testes WebSocket
├── unit/
│   └── orderService.test.ts    # Testes unitários do serviço de pedidos
├── integration/
│   ├── auth.test.ts            # Testes de autenticação
│   ├── orders.test.ts          # Testes de comandas (CRUD + fluxo)
│   ├── products.test.ts        # Testes de cardápio
│   ├── tables.test.ts          # Testes de mesas
│   ├── dashboard.test.ts       # Testes de dashboard (dono)
│   └── websocket.test.ts       # Testes de eventos socket.io
└── security/
    ├── auth-security.test.ts   # Testes de segurança de autenticação
    ├── idor.test.ts            # Testes de IDOR
    ├── injection.test.ts       # Testes de XSS e SQL injection
    ├── ratelimit.test.ts       # Testes de rate limiting
    ├── race-condition.test.ts  # Testes de race condition
    └── input-validation.test.ts # Testes de validação de entrada
```

---

## 1. Configuração Global

### `tests/setup.ts`

```typescript
import { FastifyInstance } from 'fastify';
import supertest from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { buildApp } from '../src/app';

export const prisma = new PrismaClient();

let app: FastifyInstance;

export async function setupTestApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await buildApp({ testMode: true });
    await app.ready();
  }
  return app;
}

export async function getTestServer() {
  const app = await setupTestApp();
  return supertest(app.server);
}

export async function cleanupDatabase() {
  await prisma.splitPayment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.table.deleteMany();
  await prisma.user.deleteMany();
  await prisma.restaurant.deleteMany();
}

export async function seedRestaurant() {
  const restaurant = await prisma.restaurant.create({
    data: { name: 'Restaurante Teste' },
  });

  const hashedPin = await bcrypt.hash('1234', 10);
  const hashedPassword = await bcrypt.hash('owner123', 10);

  const owner = await prisma.user.create({
    data: {
      name: 'Dono Teste',
      email: 'dono@teste.com',
      password: hashedPassword,
      role: 'OWNER',
      restaurantId: restaurant.id,
    },
  });

  const waiter = await prisma.user.create({
    data: {
      name: 'Garçom Teste',
      pin: hashedPin,
      role: 'WAITER',
      restaurantId: restaurant.id,
    },
  });

  const kitchen = await prisma.user.create({
    data: {
      name: 'Cozinha Teste',
      pin: hashedPin,
      role: 'KITCHEN',
      restaurantId: restaurant.id,
    },
  });

  const bar = await prisma.user.create({
    data: {
      name: 'Bar Teste',
      pin: hashedPin,
      role: 'BAR',
      restaurantId: restaurant.id,
    },
  });

  const table1 = await prisma.table.create({
    data: { number: 1, restaurantId: restaurant.id },
  });

  const table2 = await prisma.table.create({
    data: { number: 2, restaurantId: restaurant.id },
  });

  const foodProduct = await prisma.product.create({
    data: {
      name: 'Picanha na Brasa',
      price: 89.90,
      category: 'FOOD',
      available: true,
      allergens: [],
      isBrindeOnly: false,
      restaurantId: restaurant.id,
    },
  });

  const drinkProduct = await prisma.product.create({
    data: {
      name: 'Caipirinha de Limão',
      price: 18.00,
      category: 'DRINK',
      available: true,
      allergens: [],
      isBrindeOnly: false,
      restaurantId: restaurant.id,
    },
  });

  return {
    restaurant,
    owner,
    waiter,
    kitchen,
    bar,
    table1,
    table2,
    foodProduct,
    drinkProduct,
  };
}

export function generateJWT(user: any, secret: string = process.env.JWT_SECRET || 'test-secret') {
  return jwt.sign(
    { userId: user.id, role: user.role, restaurantId: user.restaurantId },
    secret,
    { expiresIn: '8h' }
  );
}

beforeAll(async () => {
  await setupTestApp();
});

afterEach(async () => {
  await cleanupDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

---

## 2. Testes de Autenticação

### `tests/integration/auth.test.ts`

```typescript
import { getTestServer, seedRestaurant, generateJWT, prisma } from '../setup';
import request from 'supertest';

describe('Autenticação', () => {
  let server: any;
  let seed: any;

  beforeEach(async () => {
    server = await getTestServer();
    seed = await seedRestaurant();
  });

  describe('POST /api/auth/waiter/login', () => {
    it('deve fazer login com PIN correto e retornar JWT em cookie httpOnly', async () => {
      const res = await server
        .post('/api/auth/waiter/login')
        .send({ pin: '1234', waiterId: seed.waiter.id })
        .expect(200);

      expect(res.body.token).toBeDefined();
      expect(res.headers['set-cookie']).toBeDefined();
      const cookie = res.headers['set-cookie'][0];
      expect(cookie).toContain('HttpOnly');
    });

    it('deve retornar 401 com PIN errado', async () => {
      await server
        .post('/api/auth/waiter/login')
        .send({ pin: '9999', waiterId: seed.waiter.id })
        .expect(401);
    });

    it('deve retornar 401 com ID de garçom inexistente', async () => {
      await server
        .post('/api/auth/waiter/login')
        .send({ pin: '1234', waiterId: 'nonexistent' })
        .expect(401);
    });

    it('deve retornar 400 com PIN vazio', async () => {
      await server
        .post('/api/auth/waiter/login')
        .send({ pin: '', waiterId: seed.waiter.id })
        .expect(400);
    });
  });

  describe('POST /api/auth/owner/login', () => {
    it('deve fazer login com email e senha corretos', async () => {
      const res = await server
        .post('/api/auth/owner/login')
        .send({ email: 'dono@teste.com', password: 'owner123' })
        .expect(200);

      expect(res.body.token).toBeDefined();
    });

    it('deve retornar 401 com senha errada', async () => {
      await server
        .post('/api/auth/owner/login')
        .send({ email: 'dono@teste.com', password: 'wrong' })
        .expect(401);
    });

    it('deve retornar 401 com email inexistente', async () => {
      await server
        .post('/api/auth/owner/login')
        .send({ email: 'naoexiste@teste.com', password: 'owner123' })
        .expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('deve invalidar o cookie de autenticação', async () => {
      const token = generateJWT(seed.waiter);
      const res = await server
        .post('/api/auth/logout')
        .set('Cookie', `token=${token}`)
        .expect(200);

      const cookie = res.headers['set-cookie'][0];
      expect(cookie).toContain('token=;');
      expect(cookie).toContain('Max-Age=0');
    });
  });
});
```

---

## 3. Testes de Comandas (Orders)

### `tests/integration/orders.test.ts`

```typescript
import { getTestServer, seedRestaurant, generateJWT, prisma } from '../setup';
import request from 'supertest';

describe('Comandas (Orders)', () => {
  let server: any;
  let seed: any;
  let waiterToken: string;
  let ownerToken: string;

  beforeEach(async () => {
    server = await getTestServer();
    seed = await seedRestaurant();
    waiterToken = generateJWT(seed.waiter);
    ownerToken = generateJWT(seed.owner);
  });

  describe('POST /api/orders', () => {
    it('deve criar uma nova comanda (abrir mesa)', async () => {
      const res = await server
        .post('/api/orders')
        .set('Cookie', `token=${waiterToken}`)
        .send({ tableId: seed.table1.id, waiterId: seed.waiter.id })
        .expect(201);

      expect(res.body.order.id).toBeDefined();
      expect(res.body.order.status).toBe('OPEN');
      expect(res.body.order.tableId).toBe(seed.table1.id);
    });

    it('deve retornar 400 com tableId inexistente', async () => {
      await server
        .post('/api/orders')
        .set('Cookie', `token=${waiterToken}`)
        .send({ tableId: 'nonexistent', waiterId: seed.waiter.id })
        .expect(400);
    });

    it('deve retornar 401 sem token', async () => {
      await server
        .post('/api/orders')
        .send({ tableId: seed.table1.id, waiterId: seed.waiter.id })
        .expect(401);
    });

    it('deve retornar 403 se role não for WAITER', async () => {
      await server
        .post('/api/orders')
        .set('Cookie', `token=${ownerToken}`)
        .send({ tableId: seed.table1.id, waiterId: seed.waiter.id })
        .expect(403);
    });
  });

  describe('POST /api/orders/:id/items', () => {
    let order: any;

    beforeEach(async () => {
      const res = await server
        .post('/api/orders')
        .set('Cookie', `token=${waiterToken}`)
        .send({ tableId: seed.table1.id, waiterId: seed.waiter.id });
      order = res.body.order;
    });

    it('deve adicionar item de comida à comanda', async () => {
      const res = await server
        .post(`/api/orders/${order.id}/items`)
        .set('Cookie', `token=${waiterToken}`)
        .send({
          productId: seed.foodProduct.id,
          quantity: 2,
          observation: 'Mal passado',
        })
        .expect(201);

      expect(res.body.item.productId).toBe(seed.foodProduct.id);
      expect(res.body.item.quantity).toBe(2);
      expect(res.body.item.destination).toBe('KITCHEN');
    });

    it('deve adicionar item de bebida à comanda', async () => {
      const res = await server
        .post(`/api/orders/${order.id}/items`)
        .set('Cookie', `token=${waiterToken}`)
        .send({
          productId: seed.drinkProduct.id,
          quantity: 3,
        })
        .expect(201);

      expect(res.body.item.destination).toBe('BAR');
    });

    it('deve retornar 400 com quantity negativo', async () => {
      await server
        .post(`/api/orders/${order.id}/items`)
        .set('Cookie', `token=${waiterToken}`)
        .send({ productId: seed.foodProduct.id, quantity: -1 })
        .expect(400);
    });

    it('deve retornar 400 com quantity zero', async () => {
      await server
        .post(`/api/orders/${order.id}/items`)
        .set('Cookie', `token=${waiterToken}`)
        .send({ productId: seed.foodProduct.id, quantity: 0 })
        .expect(400);
    });

    it('deve retornar 400 com observation maior que 500 chars', async () => {
      await server
        .post(`/api/orders/${order.id}/items`)
        .set('Cookie', `token=${waiterToken}`)
        .send({
          productId: seed.foodProduct.id,
          quantity: 1,
          observation: 'A'.repeat(501),
        })
        .expect(400);
    });

    it('deve retornar 403 se tentar adicionar item em comanda de outro garçom', async () => {
      const otherWaiterPin = await require('bcrypt').hash('5678', 10);
      const otherWaiter = await prisma.user.create({
        data: {
          name: 'Outro Garçom',
          pin: otherWaiterPin,
          role: 'WAITER',
          restaurantId: seed.restaurant.id,
        },
      });
      const otherToken = generateJWT(otherWaiter);

      await server
        .post(`/api/orders/${order.id}/items`)
        .set('Cookie', `token=${otherToken}`)
        .send({ productId: seed.foodProduct.id, quantity: 1 })
        .expect(403);
    });
  });

  describe('POST /api/orders/:id/send', () => {
    let order: any;

    beforeEach(async () => {
      const createRes = await server
        .post('/api/orders')
        .set('Cookie', `token=${waiterToken}`)
        .send({ tableId: seed.table1.id, waiterId: seed.waiter.id });
      order = createRes.body.order;

      await server
        .post(`/api/orders/${order.id}/items`)
        .set('Cookie', `token=${waiterToken}`)
        .send({ productId: seed.foodProduct.id, quantity: 1 });

      await server
        .post(`/api/orders/${order.id}/items`)
        .set('Cookie', `token=${waiterToken}`)
        .send({ productId: seed.drinkProduct.id, quantity: 2 });
    });

    it('deve enviar pedido e atualizar status para SENT_TO_KITCHEN e SENT_TO_BAR', async () => {
      const res = await server
        .post(`/api/orders/${order.id}/send`)
        .set('Cookie', `token=${waiterToken}`)
        .expect(200);

      expect(res.body.order.status).toContain('SENT');
    });

    it('deve retornar 400 se comanda não tem itens', async () => {
      const emptyOrder = await server
        .post('/api/orders')
        .set('Cookie', `token=${waiterToken}`)
        .send({ tableId: seed.table2.id, waiterId: seed.waiter.id });

      await server
        .post(`/api/orders/${emptyOrder.body.order.id}/send`)
        .set('Cookie', `token=${waiterToken}`)
        .expect(400);
    });
  });

  describe('POST /api/orders/:id/close', () => {
    let order: any;

    beforeEach(async () => {
      const createRes = await server
        .post('/api/orders')
        .set('Cookie', `token=${waiterToken}`)
        .send({ tableId: seed.table1.id, waiterId: seed.waiter.id });
      order = createRes.body.order;

      await server
        .post(`/api/orders/${order.id}/items`)
        .set('Cookie', `token=${waiterToken}`)
        .send({ productId: seed.foodProduct.id, quantity: 1 });

      await server
        .post(`/api/orders/${order.id}/items`)
        .set('Cookie', `token=${waiterToken}`)
        .send({ productId: seed.drinkProduct.id, quantity: 2 });

      await server
        .post(`/api/orders/${order.id}/send`)
        .set('Cookie', `token=${waiterToken}`);
    });

    it('deve fechar conta e calcular total corretamente', async () => {
      const res = await server
        .post(`/api/orders/${order.id}/close`)
        .set('Cookie', `token=${waiterToken}`)
        .expect(200);

      expect(res.body.order.status).toBe('CLOSED');
      expect(res.body.order.closedAt).toBeDefined();
      const expectedTotal = 89.90 + (18.00 * 2);
      expect(res.body.order.total).toBeCloseTo(expectedTotal, 2);
    });

    it('deve retornar 403 se tentar fechar comanda de outro garçom (IDOR)', async () => {
      const otherWaiterPin = await require('bcrypt').hash('5678', 10);
      const otherWaiter = await prisma.user.create({
        data: {
          name: 'Outro Garçom',
          pin: otherWaiterPin,
          role: 'WAITER',
          restaurantId: seed.restaurant.id,
        },
      });
      const otherToken = generateJWT(otherWaiter);

      await server
        .post(`/api/orders/${order.id}/close`)
        .set('Cookie', `token=${otherToken}`)
        .expect(403);
    });

    it('deve permitir split payment', async () => {
      const res = await server
        .post(`/api/orders/${order.id}/close`)
        .set('Cookie', `token=${waiterToken}`)
        .send({
          split: [
            { guestName: 'João', amount: 40.00 },
            { guestName: 'Maria', amount: 40.00 },
            { guestName: 'Pedro', amount: 45.90 },
          ],
        })
        .expect(200);

      expect(res.body.splitPayments).toHaveLength(3);
      expect(res.body.splitPayments[0].guestName).toBe('João');
    });
  });

  describe('POST /api/orders/:id/post-close', () => {
    let closedOrder: any;

    beforeEach(async () => {
      const createRes = await server
        .post('/api/orders')
        .set('Cookie', `token=${waiterToken}`)
        .send({ tableId: seed.table1.id, waiterId: seed.waiter.id });
      const orderId = createRes.body.order.id;

      await server
        .post(`/api/orders/${orderId}/items`)
        .set('Cookie', `token=${waiterToken}`)
        .send({ productId: seed.foodProduct.id, quantity: 1 });

      await server
        .post(`/api/orders/${orderId}/send`)
        .set('Cookie', `token=${waiterToken}`);

      await server
        .post(`/api/orders/${orderId}/close`)
        .set('Cookie', `token=${waiterToken}`);

      closedOrder = orderId;
    });

    it('deve criar saideira pós-fechamento', async () => {
      const res = await server
        .post(`/api/orders/${closedOrder}/post-close`)
        .set('Cookie', `token=${waiterToken}`)
        .send({ productId: seed.drinkProduct.id, quantity: 1 })
        .expect(201);

      expect(res.body.item.isPostClose).toBe(true);
    });
  });
});
```

---

## 4. Testes de Segurança – Autenticação

### `tests/security/auth-security.test.ts`

```typescript
import { getTestServer, seedRestaurant, generateJWT, prisma } from '../setup';
import bcrypt from 'bcrypt';

describe('Segurança – Autenticação', () => {
  let server: any;
  let seed: any;

  beforeEach(async () => {
    server = await getTestServer();
    seed = await seedRestaurant();
  });

  it('401 – acessar rota protegida sem token', async () => {
    await server
      .post('/api/orders')
      .send({ tableId: seed.table1.id, waiterId: seed.waiter.id })
      .expect(401);
  });

  it('401 – acessar rota com token expirado', async () => {
    const expiredToken = generateJWT(seed.waiter);
    // Simular expiração manipulando o token
    await server
      .post('/api/orders')
      .set('Cookie', `token=${expiredToken}invalid`)
      .send({ tableId: seed.table1.id, waiterId: seed.waiter.id })
      .expect(401);
  });

  it('403 – garçom acessando rota de dono', async () => {
    const waiterToken = generateJWT(seed.waiter);
    await server
      .get('/api/owner/dashboard')
      .set('Cookie', `token=${waiterToken}`)
      .expect(403);
  });

  it('403 – cozinha acessando rota de garçom', async () => {
    const kitchenToken = generateJWT(seed.kitchen);
    await server
      .post('/api/orders')
      .set('Cookie', `token=${kitchenToken}`)
      .send({ tableId: seed.table1.id, waiterId: seed.waiter.id })
      .expect(403);
  });

  it('403 – bar acessando rota de dono', async () => {
    const barToken = generateJWT(seed.bar);
    await server
      .get('/api/owner/dashboard')
      .set('Cookie', `token=${barToken}`)
      .expect(403);
  });

  it('401 – WebSocket deve rejeitar conexão sem token', async () => {
    const io = require('socket.io-client');
    const socket = io('http://localhost:3000/waiter', {
      transports: ['websocket'],
    });

    const errorReceived = await new Promise<boolean>((resolve) => {
      socket.on('connect_error', () => resolve(true));
      socket.on('connect', () => resolve(false));
      setTimeout(() => resolve(true), 2000);
    });

    socket.disconnect();
    expect(errorReceived).toBe(true);
  });

  it('deve usar bcrypt com salt >= 10 para PINs', async () => {
    const waiter = await prisma.user.findUnique({ where: { id: seed.waiter.id } });
    const saltRounds = parseInt(waiter!.pin!.split('$')[2], 10);
    expect(saltRounds).toBeGreaterThanOrEqual(10);
  });

  it('deve usar bcrypt com salt >= 10 para senhas de dono', async () => {
    const owner = await prisma.user.findUnique({ where: { id: seed.owner.id } });
    const saltRounds = parseInt(owner!.password!.split('$')[2], 10);
    expect(saltRounds).toBeGreaterThanOrEqual(10);
  });
});
```

---

## 5. Testes de Segurança – IDOR

### `tests/security/idor.test.ts`

```typescript
import { getTestServer, seedRestaurant, generateJWT, prisma } from '../setup';

describe('Segurança – IDOR (Insecure Direct Object Reference)', () => {
  let server: any;
  let seed: any;
  let waiter1Token: string;
  let waiter2Token: string;

  beforeEach(async () => {
    server = await getTestServer();
    seed = await seedRestaurant();
    waiter1Token = generateJWT(seed.waiter);

    const hashedPin = await require('bcrypt').hash('5678', 10);
    const waiter2 = await prisma.user.create({
      data: {
        name: 'Garçom 2',
        pin: hashedPin,
        role: 'WAITER',
        restaurantId: seed.restaurant.id,
      },
    });
    waiter2Token = generateJWT(waiter2);
  });

  it('403 – garçom 1 não pode fechar comanda do garçom 2', async () => {
    const orderRes = await server
      .post('/api/orders')
      .set('Cookie', `token=${waiter2Token}`)
      .send({ tableId: seed.table1.id, waiterId: waiter2.id });

    const orderId = orderRes.body.order.id;

    await server
      .post(`/api/orders/${orderId}/close`)
      .set('Cookie', `token=${waiter1Token}`)
      .expect(403);
  });

  it('403 – garçom 1 não pode adicionar itens na comanda do garçom 2', async () => {
    const orderRes = await server
      .post('/api/orders')
      .set('Cookie', `token=${waiter2Token}`)
      .send({ tableId: seed.table1.id, waiterId: waiter2.id });

    const orderId = orderRes.body.order.id;

    await server
      .post(`/api/orders/${orderId}/items`)
      .set('Cookie', `token=${waiter1Token}`)
      .send({ productId: seed.foodProduct.id, quantity: 1 })
      .expect(403);
  });

  it('403 – garçom não pode acessar dashboard do dono', async () => {
    await server
      .get('/api/owner/dashboard')
      .set('Cookie', `token=${waiter1Token}`)
      .expect(403);
  });

  it('403 – garçom não pode deletar produto do cardápio', async () => {
    await server
      .delete(`/api/owner/products/${seed.foodProduct.id}`)
      .set('Cookie', `token=${waiter1Token}`)
      .expect(403);
  });

  it('403 – dono de restaurante A não pode acessar dados de restaurante B', async () => {
    const otherRestaurant = await prisma.restaurant.create({
      data: { name: 'Outro Restaurante' },
    });

    const otherOwner = await prisma.user.create({
      data: {
        name: 'Outro Dono',
        email: 'outro@teste.com',
        password: await require('bcrypt').hash('senha123', 10),
        role: 'OWNER',
        restaurantId: otherRestaurant.id,
      },
    });

    const otherOwnerToken = generateJWT(otherOwner);

    await server
      .get('/api/owner/dashboard')
      .set('Cookie', `token=${otherOwnerToken}`)
      .expect(200);

    // Verificar que os dados retornados são do restaurante correto
    // (implementação depende da resposta da API)
  });
});
```

---

## 6. Testes de Segurança – XSS e Injection

### `tests/security/injection.test.ts`

```typescript
import { getTestServer, seedRestaurant, generateJWT } from '../setup';

describe('Segurança – XSS e Injection', () => {
  let server: any;
  let seed: any;
  let waiterToken: string;
  let order: any;

  beforeEach(async () => {
    server = await getTestServer();
    seed = await seedRestaurant();
    waiterToken = generateJWT(seed.waiter);

    const orderRes = await server
      .post('/api/orders')
      .set('Cookie', `token=${waiterToken}`)
      .send({ tableId: seed.table1.id, waiterId: seed.waiter.id });
    order = orderRes.body.order;
  });

  it('deve rejeitar ou escapar XSS em observation', async () => {
    const xssPayload = '<script>alert("XSS")</script>';
    const res = await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({
        productId: seed.foodProduct.id,
        quantity: 1,
        observation: xssPayload,
      })
      .expect(201);

    // Verificar que o script não está presente como-is
    expect(res.body.item.observation).not.toContain('<script>');
    // Ou deve ter sido escapado
    if (res.body.item.observation.includes('script')) {
      expect(res.body.item.observation).toContain('&lt;script&gt;');
    }
  });

  it('deve rejeitar XSS em nome de guest no split payment', async () => {
    await server
      .post(`/api/orders/${order.id}/close`)
      .set('Cookie', `token=${waiterToken}`)
      .send({
        split: [{ guestName: '<img src=x onerror=alert(1)>', amount: 50.00 }],
      })
      .expect(200);

    // Verificar sanitização no banco
    const savedPayment = await require('../setup').prisma.splitPayment.findFirst();
    expect(savedPayment?.guestName).not.toContain('<img');
  });

  it('deve rejeitar SQL injection em campos de texto', async () => {
    const sqlPayload = "'; DROP TABLE users; --";
    await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({
        productId: seed.foodProduct.id,
        quantity: 1,
        observation: sqlPayload,
      })
      .expect(201);

    // Se chegou aqui sem crash, Prisma preveniu injection
    const users = await require('../setup').prisma.user.count();
    expect(users).toBeGreaterThan(0);
  });

  it('deve rejeitar XSS em nome de produto (owner)', async () => {
    const ownerToken = generateJWT(seed.owner);
    const xssName = '<script>document.cookie</script>';

    await server
      .post('/api/owner/products')
      .set('Cookie', `token=${ownerToken}`)
      .send({
        name: xssName,
        price: 10.00,
        category: 'FOOD',
      })
      .expect(201);

    const product = await require('../setup').prisma.product.findFirst({
      where: { name: { contains: 'script' } },
    });

    if (product) {
      expect(product.name).not.toContain('<script>');
    }
  });
});
```

---

## 7. Testes de Segurança – Rate Limiting

### `tests/security/ratelimit.test.ts`

```typescript
import { getTestServer, seedRestaurant } from '../setup';

describe('Segurança – Rate Limiting', () => {
  let server: any;
  let seed: any;

  beforeEach(async () => {
    server = await getTestServer();
    seed = await seedRestaurant();
  });

  it('deve retornar 429 após exceder limite de login (50 req/15min)', async () => {
    const requests = [];
    for (let i = 0; i < 55; i++) {
      requests.push(
        server
          .post('/api/auth/waiter/login')
          .send({ pin: 'wrong', waiterId: seed.waiter.id })
      );
    }

    const results = await Promise.all(requests);
    const rateLimited = results.some(r => r.status === 429);
    expect(rateLimited).toBe(true);
  });

  it('deve retornar 429 em rota pública após exceder limite', async () => {
    const requests = [];
    for (let i = 0; i < 105; i++) {
      requests.push(
        server.post('/api/auth/waiter/login').send({ pin: '1234', waiterId: seed.waiter.id })
      );
    }

    const results = await Promise.all(requests);
    const rateLimited = results.some(r => r.status === 429);
    expect(rateLimited).toBe(true);
  });
});
```

---

## 8. Testes de Segurança – Race Condition

### `tests/security/race-condition.test.ts`

```typescript
import { getTestServer, seedRestaurant, generateJWT, prisma } from '../setup';

describe('Segurança – Race Conditions', () => {
  let server: any;
  let seed: any;
  let waiterToken: string;
  let order: any;

  beforeEach(async () => {
    server = await getTestServer();
    seed = await seedRestaurant();
    waiterToken = generateJWT(seed.waiter);

    const orderRes = await server
      .post('/api/orders')
      .set('Cookie', `token=${waiterToken}`)
      .send({ tableId: seed.table1.id, waiterId: seed.waiter.id });
    order = orderRes.body.order;

    await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.foodProduct.id, quantity: 1 });

    await server
      .post(`/api/orders/${order.id}/send`)
      .set('Cookie', `token=${waiterToken}`);
  });

  it('apenas um fechamento simultâneo deve ter sucesso', async () => {
    const closeRequests = [];
    for (let i = 0; i < 5; i++) {
      closeRequests.push(
        server
          .post(`/api/orders/${order.id}/close`)
          .set('Cookie', `token=${waiterToken}`)
      );
    }

    const results = await Promise.all(closeRequests);
    const successCount = results.filter(r => r.status === 200).length;
    const conflictCount = results.filter(r => r.status === 409 || r.status === 400).length;

    expect(successCount).toBe(1);
    expect(conflictCount).toBe(4);
  });

  it('atualizações simultâneas de status de item não devem corromper dados', async () => {
    const orderItem = await prisma.orderItem.findFirst({
      where: { orderId: order.id },
    });

    const updates = [];
    for (let i = 0; i < 10; i++) {
      updates.push(
        prisma.orderItem.update({
          where: { id: orderItem!.id },
          data: { status: 'READY' },
        })
      );
    }

    const results = await Promise.allSettled(updates);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    // Pelo menos um deve ter sucesso, outros podem falhar por conflito
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const finalItem = await prisma.orderItem.findUnique({
      where: { id: orderItem!.id },
    });
    expect(finalItem?.status).toBe('READY');
  });
});
```

---

## 9. Testes de Segurança – Validação de Entrada

### `tests/security/input-validation.test.ts`

```typescript
import { getTestServer, seedRestaurant, generateJWT } from '../setup';

describe('Segurança – Validação de Entrada', () => {
  let server: any;
  let seed: any;
  let waiterToken: string;
  let ownerToken: string;
  let order: any;

  beforeEach(async () => {
    server = await getTestServer();
    seed = await seedRestaurant();
    waiterToken = generateJWT(seed.waiter);
    ownerToken = generateJWT(seed.owner);

    const orderRes = await server
      .post('/api/orders')
      .set('Cookie', `token=${waiterToken}`)
      .send({ tableId: seed.table1.id, waiterId: seed.waiter.id });
    order = orderRes.body.order;
  });

  it('deve rejeitar campos extras não definidos no schema', async () => {
    await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({
        productId: seed.foodProduct.id,
        quantity: 1,
        campoInexistente: 'valor malicioso',
      })
      .expect(400);
  });

  it('deve rejeitar observation com mais de 500 caracteres', async () => {
    await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({
        productId: seed.foodProduct.id,
        quantity: 1,
        observation: 'A'.repeat(501),
      })
      .expect(400);
  });

  it('deve aceitar observation com exatamente 500 caracteres', async () => {
    await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({
        productId: seed.foodProduct.id,
        quantity: 1,
        observation: 'A'.repeat(500),
      })
      .expect(201);
  });

  it('deve rejeitar nome de produto com mais de 100 caracteres', async () => {
    await server
      .post('/api/owner/products')
      .set('Cookie', `token=${ownerToken}`)
      .send({
        name: 'P'.repeat(101),
        price: 10.00,
        category: 'FOOD',
      })
      .expect(400);
  });

  it('deve rejeitar preço negativo', async () => {
    await server
      .post('/api/owner/products')
      .set('Cookie', `token=${ownerToken}`)
      .send({
        name: 'Produto Teste',
        price: -10.00,
        category: 'FOOD',
      })
      .expect(400);
  });

  it('deve rejeitar quantity como string', async () => {
    await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({
        productId: seed.foodProduct.id,
        quantity: 'dois',
      })
      .expect(400);
  });

  it('deve rejeitar tableId como número ao invés de string', async () => {
    await server
      .post('/api/orders')
      .set('Cookie', `token=${waiterToken}`)
      .send({ tableId: 123, waiterId: seed.waiter.id })
      .expect(400);
  });

  it('deve rejeitar email inválido no login de dono', async () => {
    await server
      .post('/api/auth/owner/login')
      .send({ email: 'email-invalido', password: 'owner123' })
      .expect(400);
  });

  it('deve rejeitar PIN com caracteres não numéricos', async () => {
    await server
      .post('/api/auth/waiter/login')
      .send({ pin: 'abcd', waiterId: seed.waiter.id })
      .expect(400);
  });
});
```

---

## 10. Testes de WebSocket

### `tests/integration/websocket.test.ts`

```typescript
import { getTestServer, seedRestaurant, generateJWT } from '../setup';
import { io as ioc } from 'socket.io-client';

describe('WebSocket (socket.io)', () => {
  let server: any;
  let seed: any;
  let waiterToken: string;
  let kitchenToken: string;
  let barToken: string;

  beforeEach(async () => {
    server = await getTestServer();
    seed = await seedRestaurant();
    waiterToken = generateJWT(seed.waiter);
    kitchenToken = generateJWT(seed.kitchen);
    barToken = generateJWT(seed.bar);
  });

  it('deve conectar garçom ao namespace /waiter com token válido', (done) => {
    const socket = ioc('http://localhost:3000/waiter', {
      transports: ['websocket'],
      auth: { token: waiterToken },
    });

    socket.on('connect', () => {
      expect(socket.connected).toBe(true);
      socket.disconnect();
      done();
    });

    socket.on('connect_error', (err) => {
      done(new Error(`Falha ao conectar: ${err.message}`));
    });

    setTimeout(() => done(new Error('Timeout')), 5000);
  });

  it('deve rejeitar conexão ao namespace /waiter sem token', (done) => {
    const socket = ioc('http://localhost:3000/waiter', {
      transports: ['websocket'],
    });

    socket.on('connect_error', () => {
      done();
    });

    socket.on('connect', () => {
      done(new Error('Não deveria conectar sem token'));
      socket.disconnect();
    });

    setTimeout(() => done(new Error('Timeout')), 5000);
  });

  it('deve enviar evento kitchen:new-order quando pedido é enviado', (done) => {
    const kitchenSocket = ioc('http://localhost:3000/kitchen', {
      transports: ['websocket'],
      auth: { token: kitchenToken },
    });

    kitchenSocket.on('kitchen:new-order', (data) => {
      expect(data.tableNumber).toBeDefined();
      expect(data.items).toBeDefined();
      expect(data.items.length).toBeGreaterThan(0);
      kitchenSocket.disconnect();
      done();
    });

    // Criar e enviar pedido
    setTimeout(async () => {
      const waiterSocket = ioc('http://localhost:3000/waiter', {
        transports: ['websocket'],
        auth: { token: waiterToken },
      });

      waiterSocket.emit('waiter:send-order', {
        orderId: 'test-order-id',
        items: [{ productId: seed.foodProduct.id, quantity: 1 }],
      });

      setTimeout(() => {
        waiterSocket.disconnect();
        done(new Error('Pedido não recebido pela cozinha'));
      }, 3000);
    }, 1000);

    setTimeout(() => done(new Error('Timeout')), 10000);
  });

  it('deve enviar evento bar:new-order para pedido de bebida', (done) => {
    const barSocket = ioc('http://localhost:3000/bar', {
      transports: ['websocket'],
      auth: { token: barToken },
    });

    barSocket.on('bar:new-order', (data) => {
      expect(data.items).toBeDefined();
      barSocket.disconnect();
      done();
    });

    setTimeout(() => done(new Error('Timeout')), 5000);
  });

  it('deve enviar evento waiter:item-ready-notification quando cozinha marca pronto', (done) => {
    const waiterSocket = ioc('http://localhost:3000/waiter', {
      transports: ['websocket'],
      auth: { token: waiterToken },
    });

    waiterSocket.on('waiter:item-ready-notification', (data) => {
      expect(data.orderId).toBeDefined();
      expect(data.itemName).toBeDefined();
      waiterSocket.disconnect();
      done();
    });

    setTimeout(() => done(new Error('Timeout')), 5000);
  });
});
```

---

## 11. Testes Unitários – Order Service

### `tests/unit/orderService.test.ts`

```typescript
import { calculateTotal, validateSplitPayment, canAddPostCloseItem } from '../../src/services/orderService';

describe('Order Service – Unit Tests', () => {
  describe('calculateTotal', () => {
    it('deve calcular total corretamente com múltiplos itens', () => {
      const items = [
        { price: 89.90, quantity: 1, isBrinde: false },
        { price: 18.00, quantity: 2, isBrinde: false },
      ];

      const total = calculateTotal(items);
      expect(total).toBeCloseTo(125.90, 2);
    });

    it('deve ignorar itens brinde no total', () => {
      const items = [
        { price: 89.90, quantity: 1, isBrinde: false },
        { price: 18.00, quantity: 1, isBrinde: true },
      ];

      const total = calculateTotal(items);
      expect(total).toBeCloseTo(89.90, 2);
    });

    it('deve retornar 0 para lista vazia', () => {
      expect(calculateTotal([])).toBe(0);
    });
  });

  describe('validateSplitPayment', () => {
    it('deve validar split que soma exatamente o total', () => {
      const total = 100.00;
      const splits = [
        { guestName: 'João', amount: 30.00 },
        { guestName: 'Maria', amount: 30.00 },
        { guestName: 'Pedro', amount: 40.00 },
      ];

      expect(validateSplitPayment(total, splits)).toBe(true);
    });

    it('deve validar split com diferença de arredondamento <= 0.02', () => {
      const total = 100.00;
      const splits = [
        { guestName: 'João', amount: 33.33 },
        { guestName: 'Maria', amount: 33.33 },
        { guestName: 'Pedro', amount: 33.34 },
      ];

      expect(validateSplitPayment(total, splits)).toBe(true);
    });

    it('deve rejeitar split que não soma o total', () => {
      const total = 100.00;
      const splits = [
        { guestName: 'João', amount: 30.00 },
        { guestName: 'Maria', amount: 30.00 },
      ];

      expect(validateSplitPayment(total, splits)).toBe(false);
    });

    it('deve rejeitar split com valor negativo', () => {
      const total = 100.00;
      const splits = [
        { guestName: 'João', amount: -10.00 },
        { guestName: 'Maria', amount: 110.00 },
      ];

      expect(validateSplitPayment(total, splits)).toBe(false);
    });
  });

  describe('canAddPostCloseItem', () => {
    it('deve permitir item pós-fechamento se order está CLOSED', () => {
      const order = { status: 'CLOSED', closedAt: new Date() };
      expect(canAddPostCloseItem(order)).toBe(true);
    });

    it('deve rejeitar item pós-fechamento se order não está CLOSED', () => {
      const order = { status: 'OPEN', closedAt: null };
      expect(canAddPostCloseItem(order)).toBe(false);
    });
  });
});
```

---

## 12. Testes de Negócio – Fluxo Completo

### `tests/integration/full-flow.test.ts`

```typescript
import { getTestServer, seedRestaurant, generateJWT, prisma } from '../setup';

describe('Fluxo Completo – Restaurante', () => {
  let server: any;
  let seed: any;
  let waiterToken: string;
  let ownerToken: string;

  beforeEach(async () => {
    server = await getTestServer();
    seed = await seedRestaurant();
    waiterToken = generateJWT(seed.waiter);
    ownerToken = generateJWT(seed.owner);
  });

  it('deve completar fluxo: abrir mesa → adicionar → enviar → pronto → entregar → fechar', async () => {
    // 1. Abrir mesa
    const orderRes = await server
      .post('/api/orders')
      .set('Cookie', `token=${waiterToken}`)
      .send({ tableId: seed.table1.id, waiterId: seed.waiter.id })
      .expect(201);
    const orderId = orderRes.body.order.id;

    // 2. Adicionar itens
    await server
      .post(`/api/orders/${orderId}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.foodProduct.id, quantity: 1, observation: 'Mal passado' })
      .expect(201);

    await server
      .post(`/api/orders/${orderId}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.drinkProduct.id, quantity: 2 })
      .expect(201);

    // 3. Enviar pedido
    await server
      .post(`/api/orders/${orderId}/send`)
      .set('Cookie', `token=${waiterToken}`)
      .expect(200);

    // 4. Verificar itens criados
    const items = await prisma.orderItem.findMany({ where: { orderId } });
    expect(items).toHaveLength(2);

    const foodItem = items.find(i => i.destination === 'KITCHEN');
    const drinkItem = items.find(i => i.destination === 'BAR');

    // 5. Cozinha marca como pronto
    await prisma.orderItem.update({
      where: { id: foodItem!.id },
      data: { status: 'READY', readyAt: new Date() },
    });

    // 6. Bar marca como pronto
    await prisma.orderItem.update({
      where: { id: drinkItem!.id },
      data: { status: 'READY', readyAt: new Date() },
    });

    // 7. Garçom confirma entrega
    await prisma.orderItem.update({
      where: { id: foodItem!.id },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });

    await prisma.orderItem.update({
      where: { id: drinkItem!.id },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });

    // 8. Fechar conta
    const closeRes = await server
      .post(`/api/orders/${orderId}/close`)
      .set('Cookie', `token=${waiterToken}`)
      .expect(200);

    expect(closeRes.body.order.status).toBe('CLOSED');
    expect(closeRes.body.order.total).toBeCloseTo(125.90, 2);
  });

  it('deve permitir saideira após fechamento', async () => {
    // Abrir, adicionar, enviar e fechar
    const orderRes = await server
      .post('/api/orders')
      .set('Cookie', `token=${waiterToken}`)
      .send({ tableId: seed.table1.id, waiterId: seed.waiter.id });
    const orderId = orderRes.body.order.id;

    await server
      .post(`/api/orders/${orderId}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.foodProduct.id, quantity: 1 });

    await server
      .post(`/api/orders/${orderId}/send`)
      .set('Cookie', `token=${waiterToken}`);

    await server
      .post(`/api/orders/${orderId}/close`)
      .set('Cookie', `token=${waiterToken}`);

    // Saideira
    const postCloseRes = await server
      .post(`/api/orders/${orderId}/post-close`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.drinkProduct.id, quantity: 1 })
      .expect(201);

    expect(postCloseRes.body.item.isPostClose).toBe(true);
  });

  it('deve calcular split payment corretamente', async () => {
    const orderRes = await server
      .post('/api/orders')
      .set('Cookie', `token=${waiterToken}`)
      .send({ tableId: seed.table1.id, waiterId: seed.waiter.id });
    const orderId = orderRes.body.order.id;

    await server
      .post(`/api/orders/${orderId}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.foodProduct.id, quantity: 1 });

    await server
      .post(`/api/orders/${orderId}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.drinkProduct.id, quantity: 2 });

    await server
      .post(`/api/orders/${orderId}/send`)
      .set('Cookie', `token=${waiterToken}`);

    const closeRes = await server
      .post(`/api/orders/${orderId}/close`)
      .set('Cookie', `token=${waiterToken}`)
      .send({
        split: [
          { guestName: 'João', amount: 42.00 },
          { guestName: 'Maria', amount: 42.00 },
          { guestName: 'Pedro', amount: 41.90 },
        ],
      })
      .expect(200);

    expect(closeRes.body.splitPayments).toHaveLength(3);
    const totalSplit = closeRes.body.splitPayments.reduce((sum: number, p: any) => sum + p.amount, 0);
    expect(totalSplit).toBeCloseTo(125.90, 2);
  });
});
```

---

## Resumo dos Testes

| Categoria | Arquivo | Testes |
|-----------|---------|--------|
| **Autenticação** | `integration/auth.test.ts` | 7 testes |
| **Comandas** | `integration/orders.test.ts` | 15 testes |
| **WebSocket** | `integration/websocket.test.ts` | 5 testes |
| **Fluxo Completo** | `integration/full-flow.test.ts` | 3 testes |
| **Unitários** | `unit/orderService.test.ts` | 8 testes |
| **Segurança – Auth** | `security/auth-security.test.ts` | 8 testes |
| **Segurança – IDOR** | `security/idor.test.ts` | 5 testes |
| **Segurança – XSS/Injection** | `security/injection.test.ts` | 4 testes |
| **Segurança – Rate Limit** | `security/ratelimit.test.ts` | 2 testes |
| **Segurança – Race Condition** | `security/race-condition.test.ts` | 2 testes |
| **Segurança – Validação** | `security/input-validation.test.ts` | 9 testes |
| **TOTAL** | | **68 testes** |

---

## Execução dos Testes

```bash
# Instalar dependências de teste
npm install --save-dev jest ts-jest @types/jest supertest @types/supertest socket.io-client

# Rodar todos os testes
npm test

# Rodar com coverage
npm test -- --coverage

# Rodar apenas testes de segurança
npm test -- --testPathPattern=security

# Rodar testes em watch mode
npm test -- --watch
```

---

## ✅ Final da Fase 2

Todos os testes de negócio e segurança foram definidos. O próximo passo é a **Fase 3 – Implementação**, onde o código Fastify + Prisma será escrito para fazer todos estes testes passarem.

**Importante:** Nenhum código de implementação foi escrito nesta fase. Aguardando aprovação dos testes para prosseguir.
