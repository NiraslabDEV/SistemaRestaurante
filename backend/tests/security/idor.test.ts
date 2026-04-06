import { getTestServer, seedRestaurant, generateJWT, prisma } from '../setup';
import bcrypt from 'bcrypt';

describe('Segurança – IDOR (Insecure Direct Object Reference)', () => {
  let server: any;
  let seed: any;
  let waiter1Token: string;
  let waiter2Token: string;
  let waiter2: any;

  beforeEach(async () => {
    server = await getTestServer();
    seed = await seedRestaurant();
    waiter1Token = generateJWT(seed.waiter);

    const hashedPin = await bcrypt.hash('5678', 10);
    waiter2 = await prisma.user.create({
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
    // Garçom 2 cria comanda
    const orderRes = await server
      .post('/api/orders')
      .set('Cookie', `token=${waiter2Token}`)
      .send({ tableId: seed.table1.id, waiterId: waiter2.id });

    const orderId = orderRes.body.order.id;

    await server
      .post(`/api/orders/${orderId}/items`)
      .set('Cookie', `token=${waiter2Token}`)
      .send({ productId: seed.foodProduct.id, quantity: 1 });

    await server
      .post(`/api/orders/${orderId}/send`)
      .set('Cookie', `token=${waiter2Token}`);

    // Garçom 1 tenta fechar → deve ser 403
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

  it('403 – garçom 1 não pode enviar comanda do garçom 2', async () => {
    const orderRes = await server
      .post('/api/orders')
      .set('Cookie', `token=${waiter2Token}`)
      .send({ tableId: seed.table1.id, waiterId: waiter2.id });

    await server
      .post(`/api/orders/${orderRes.body.order.id}/items`)
      .set('Cookie', `token=${waiter2Token}`)
      .send({ productId: seed.foodProduct.id, quantity: 1 });

    await server
      .post(`/api/orders/${orderRes.body.order.id}/send`)
      .set('Cookie', `token=${waiter1Token}`)
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

  it('403 – garçom não pode editar produto do cardápio', async () => {
    await server
      .put(`/api/owner/products/${seed.foodProduct.id}`)
      .set('Cookie', `token=${waiter1Token}`)
      .send({ name: 'Produto Editado', price: 5.00, category: 'FOOD' })
      .expect(403);
  });

  it('403 – garçom não pode listar/deletar outros garçons', async () => {
    await server
      .delete(`/api/owner/workers/${seed.waiter.id}`)
      .set('Cookie', `token=${waiter1Token}`)
      .expect(403);
  });

  it('403 – dono não pode acessar dados de mesa de outro restaurante', async () => {
    // Criar segundo restaurante com dono separado
    const otherRestaurant = await prisma.restaurant.create({
      data: { name: 'Outro Restaurante' },
    });
    const otherOwner = await prisma.user.create({
      data: {
        name: 'Outro Dono',
        email: 'outro@teste.com',
        password: await bcrypt.hash('senha123', 10),
        role: 'OWNER',
        restaurantId: otherRestaurant.id,
      },
    });
    const otherOwnerToken = generateJWT(otherOwner);

    // Tentar acessar mesas do restaurante original com token do outro dono
    await server
      .get(`/api/restaurants/${seed.restaurant.id}/tables`)
      .set('Cookie', `token=${otherOwnerToken}`)
      .expect(403);
  });
});
