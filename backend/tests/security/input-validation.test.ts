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

  // --- Campos extras ---
  it('deve rejeitar campos extras não definidos no schema (adicionar item)', async () => {
    await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({
        productId: seed.foodProduct.id,
        quantity: 1,
        campoMalicioso: 'valor injetado',
        __proto__: { isAdmin: true },
      })
      .expect(400);
  });

  // --- Tamanhos de campo ---
  it('deve rejeitar observation com mais de 500 caracteres', async () => {
    await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.foodProduct.id, quantity: 1, observation: 'A'.repeat(501) })
      .expect(400);
  });

  it('deve aceitar observation com exatamente 500 caracteres', async () => {
    await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.foodProduct.id, quantity: 1, observation: 'A'.repeat(500) })
      .expect(201);
  });

  it('deve rejeitar observation com 10.000+ caracteres', async () => {
    await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.foodProduct.id, quantity: 1, observation: 'X'.repeat(10001) })
      .expect(400);
  });

  it('deve rejeitar nome de produto com mais de 100 caracteres', async () => {
    await server
      .post('/api/owner/products')
      .set('Cookie', `token=${ownerToken}`)
      .send({ name: 'P'.repeat(101), price: 10.00, category: 'FOOD' })
      .expect(400);
  });

  // --- Tipos de dados ---
  it('deve rejeitar quantity negativo', async () => {
    await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.foodProduct.id, quantity: -1 })
      .expect(400);
  });

  it('deve rejeitar quantity zero', async () => {
    await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.foodProduct.id, quantity: 0 })
      .expect(400);
  });

  it('deve rejeitar quantity como string', async () => {
    await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.foodProduct.id, quantity: 'dois' })
      .expect(400);
  });

  it('deve rejeitar tableId como número ao invés de string', async () => {
    await server
      .post('/api/orders')
      .set('Cookie', `token=${waiterToken}`)
      .send({ tableId: 123, waiterId: seed.waiter.id })
      .expect(400);
  });

  it('deve rejeitar preço negativo em produto', async () => {
    await server
      .post('/api/owner/products')
      .set('Cookie', `token=${ownerToken}`)
      .send({ name: 'Produto Teste', price: -10.00, category: 'FOOD' })
      .expect(400);
  });

  it('deve rejeitar preço zero em produto', async () => {
    await server
      .post('/api/owner/products')
      .set('Cookie', `token=${ownerToken}`)
      .send({ name: 'Produto Teste', price: 0, category: 'FOOD' })
      .expect(400);
  });

  // --- Validação de formato ---
  it('deve rejeitar email inválido no login de dono', async () => {
    await server
      .post('/api/auth/owner/login')
      .send({ email: 'email-invalido-sem-arroba', password: 'owner123' })
      .expect(400);
  });

  it('deve rejeitar PIN com caracteres não numéricos', async () => {
    await server
      .post('/api/auth/waiter/login')
      .send({ pin: 'abcd', waiterId: seed.waiter.id })
      .expect(400);
  });

  it('deve rejeitar category inválida em produto', async () => {
    await server
      .post('/api/owner/products')
      .set('Cookie', `token=${ownerToken}`)
      .send({ name: 'Produto Teste', price: 10.00, category: 'INVALIDA' })
      .expect(400);
  });

  it('deve rejeitar amount negativo no split payment', async () => {
    await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.foodProduct.id, quantity: 1 });

    await server
      .post(`/api/orders/${order.id}/send`)
      .set('Cookie', `token=${waiterToken}`);

    await server
      .post(`/api/orders/${order.id}/close`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ split: [{ guestName: 'João', amount: -50.00 }] })
      .expect(400);
  });
});
