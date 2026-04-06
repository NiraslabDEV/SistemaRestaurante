import { getTestServer, seedRestaurant, generateJWT, prisma } from '../setup';
import bcrypt from 'bcrypt';

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
        .send({ productId: seed.foodProduct.id, quantity: 2, observation: 'Mal passado' })
        .expect(201);

      expect(res.body.item.productId).toBe(seed.foodProduct.id);
      expect(res.body.item.quantity).toBe(2);
      expect(res.body.item.destination).toBe('KITCHEN');
    });

    it('deve adicionar item de bebida à comanda com destino BAR', async () => {
      const res = await server
        .post(`/api/orders/${order.id}/items`)
        .set('Cookie', `token=${waiterToken}`)
        .send({ productId: seed.drinkProduct.id, quantity: 3 })
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
        .send({ productId: seed.foodProduct.id, quantity: 1, observation: 'A'.repeat(501) })
        .expect(400);
    });

    it('deve retornar 403 se tentar adicionar item em comanda de outro garçom (IDOR)', async () => {
      const otherPin = await bcrypt.hash('5678', 10);
      const otherWaiter = await prisma.user.create({
        data: { name: 'Outro Garçom', pin: otherPin, role: 'WAITER', restaurantId: seed.restaurant.id },
      });
      const otherToken = generateJWT(otherWaiter);

      await server
        .post(`/api/orders/${order.id}/items`)
        .set('Cookie', `token=${otherToken}`)
        .send({ productId: seed.foodProduct.id, quantity: 1 })
        .expect(403);
    });

    it('deve retornar 401 sem token', async () => {
      await server
        .post(`/api/orders/${order.id}/items`)
        .send({ productId: seed.foodProduct.id, quantity: 1 })
        .expect(401);
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

    it('deve enviar pedido e atualizar status', async () => {
      const res = await server
        .post(`/api/orders/${order.id}/send`)
        .set('Cookie', `token=${waiterToken}`)
        .expect(200);

      expect(res.body.order.status).toMatch(/SENT/);
    });

    it('deve retornar 400 se comanda não tem itens', async () => {
      const emptyOrderRes = await server
        .post('/api/orders')
        .set('Cookie', `token=${waiterToken}`)
        .send({ tableId: seed.table2.id, waiterId: seed.waiter.id });

      await server
        .post(`/api/orders/${emptyOrderRes.body.order.id}/send`)
        .set('Cookie', `token=${waiterToken}`)
        .expect(400);
    });

    it('deve retornar 401 sem token', async () => {
      await server
        .post(`/api/orders/${order.id}/send`)
        .expect(401);
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
      const expectedTotal = 89.90 + (18.00 * 2); // 125.90
      expect(res.body.order.total).toBeCloseTo(expectedTotal, 2);
    });

    it('deve retornar 403 se tentar fechar comanda de outro garçom (IDOR)', async () => {
      const otherPin = await bcrypt.hash('5678', 10);
      const otherWaiter = await prisma.user.create({
        data: { name: 'Outro Garçom', pin: otherPin, role: 'WAITER', restaurantId: seed.restaurant.id },
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

    it('deve retornar 401 sem token', async () => {
      await server
        .post(`/api/orders/${order.id}/close`)
        .expect(401);
    });
  });

  describe('POST /api/orders/:id/post-close (saideira)', () => {
    let closedOrderId: string;

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

      closedOrderId = orderId;
    });

    it('deve criar saideira pós-fechamento marcada como isPostClosed', async () => {
      const res = await server
        .post(`/api/orders/${closedOrderId}/post-close`)
        .set('Cookie', `token=${waiterToken}`)
        .send({ productId: seed.drinkProduct.id, quantity: 1 })
        .expect(201);

      expect(res.body.item.isPostClose).toBe(true);
    });

    it('deve retornar 401 sem token', async () => {
      await server
        .post(`/api/orders/${closedOrderId}/post-close`)
        .send({ productId: seed.drinkProduct.id, quantity: 1 })
        .expect(401);
    });
  });
});
