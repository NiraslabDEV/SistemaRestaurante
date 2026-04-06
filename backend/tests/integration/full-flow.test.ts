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

    // 4. Verificar que itens foram criados com destino correto
    const items = await prisma.orderItem.findMany({ where: { orderId } });
    expect(items).toHaveLength(2);

    const foodItem = items.find((i: { destination: string }) => i.destination === 'KITCHEN');
    const drinkItem = items.find((i: { destination: string }) => i.destination === 'BAR');
    expect(foodItem).toBeDefined();
    expect(drinkItem).toBeDefined();

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
    // 89.90 * 1 + 18.00 * 2 = 125.90
    expect(closeRes.body.order.total).toBeCloseTo(125.90, 2);
  });

  it('deve permitir saideira após fechamento e não afetar total original', async () => {
    // Criar e fechar comanda
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

    const closeRes = await server
      .post(`/api/orders/${orderId}/close`)
      .set('Cookie', `token=${waiterToken}`)
      .expect(200);

    const originalTotal = closeRes.body.order.total;

    // Adicionar saideira
    const saidRes = await server
      .post(`/api/orders/${orderId}/post-close`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.drinkProduct.id, quantity: 1 })
      .expect(201);

    expect(saidRes.body.item.isPostClose).toBe(true);

    // Total original não deve mudar
    const updatedOrder = await prisma.order.findUnique({ where: { id: orderId } });
    expect(updatedOrder?.total).toBeCloseTo(originalTotal, 2);
  });

  it('deve calcular split payment corretamente com arredondamento', async () => {
    const createRes = await server
      .post('/api/orders')
      .set('Cookie', `token=${waiterToken}`)
      .send({ tableId: seed.table1.id, waiterId: seed.waiter.id });
    const orderId = createRes.body.order.id;

    // Total: 89.90 (1 picanha)
    await server
      .post(`/api/orders/${orderId}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.foodProduct.id, quantity: 1 });

    await server
      .post(`/api/orders/${orderId}/send`)
      .set('Cookie', `token=${waiterToken}`);

    // Dividir por 3: 29.97 + 29.97 + 29.96 = 89.90
    const closeRes = await server
      .post(`/api/orders/${orderId}/close`)
      .set('Cookie', `token=${waiterToken}`)
      .send({
        split: [
          { guestName: 'João', amount: 29.97 },
          { guestName: 'Maria', amount: 29.97 },
          { guestName: 'Pedro', amount: 29.96 },
        ],
      })
      .expect(200);

    expect(closeRes.body.splitPayments).toHaveLength(3);
    const splitTotal = closeRes.body.splitPayments.reduce(
      (sum: number, s: any) => sum + s.amount,
      0
    );
    expect(splitTotal).toBeCloseTo(89.90, 1);
  });
});
