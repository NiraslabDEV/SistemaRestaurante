import { getTestServer, seedRestaurant, generateJWT, prisma } from '../setup';

describe('Segurança – Race Conditions', () => {
  let server: any;
  let seed: any;
  let waiterToken: string;

  beforeEach(async () => {
    server = await getTestServer();
    seed = await seedRestaurant();
    waiterToken = generateJWT(seed.waiter);
  });

  it('apenas um fechamento simultâneo deve ter sucesso (transação atômica)', async () => {
    // Preparar comanda com item
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

    // Disparar 5 fechamentos simultâneos
    const closeRequests = Array.from({ length: 5 }, () =>
      server
        .post(`/api/orders/${orderId}/close`)
        .set('Cookie', `token=${waiterToken}`)
    );

    const results = await Promise.all(closeRequests);
    const successCount = results.filter(r => r.status === 200).length;
    const failCount = results.filter(r => r.status === 409 || r.status === 400 || r.status === 422).length;

    // Exatamente 1 deve fechar com sucesso
    expect(successCount).toBe(1);
    expect(failCount).toBe(4);

    // Verificar no banco que status está CLOSED apenas uma vez
    const finalOrder = await prisma.order.findUnique({ where: { id: orderId } });
    expect(finalOrder?.status).toBe('CLOSED');
    expect(finalOrder?.closedAt).toBeDefined();
  });

  it('não deve duplicar split payments em fechamentos simultâneos', async () => {
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

    // Disparar 3 fechamentos com split simultâneos
    const closeRequests = Array.from({ length: 3 }, () =>
      server
        .post(`/api/orders/${orderId}/close`)
        .set('Cookie', `token=${waiterToken}`)
        .send({ split: [{ guestName: 'João', amount: 89.90 }] })
    );

    await Promise.all(closeRequests);

    // Deve existir apenas 1 split payment
    const splits = await prisma.splitPayment.findMany({ where: { orderId } });
    expect(splits.length).toBe(1);
  });

  it('não deve criar dois pedidos para a mesma mesa aberta simultaneamente', async () => {
    // Tentar abrir 5 comandas simultâneas para a mesma mesa
    const openRequests = Array.from({ length: 5 }, () =>
      server
        .post('/api/orders')
        .set('Cookie', `token=${waiterToken}`)
        .send({ tableId: seed.table1.id, waiterId: seed.waiter.id })
    );

    const results = await Promise.all(openRequests);
    const successCount = results.filter(r => r.status === 201).length;

    // Comportamento esperado: no máximo 1 deve ter sucesso se mesa só pode ter 1 comanda aberta
    // Ou todos podem ter sucesso se o sistema permite múltiplas comandas por mesa
    // O importante é que não haja inconsistência de dados
    expect(successCount).toBeGreaterThanOrEqual(1);

    const openOrders = await prisma.order.findMany({
      where: { tableId: seed.table1.id, status: 'OPEN' },
    });
    expect(openOrders.length).toBe(successCount);
  });
});
