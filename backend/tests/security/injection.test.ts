import { getTestServer, seedRestaurant, generateJWT, prisma } from '../setup';

describe('Segurança – XSS e Injection', () => {
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

  it('deve rejeitar ou escapar XSS em campo observation', async () => {
    const xssPayload = '<script>alert("XSS")</script>';
    const res = await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.foodProduct.id, quantity: 1, observation: xssPayload })
      .expect(201);

    // Tag <script> não deve aparecer como texto puro
    expect(res.body.item.observation).not.toContain('<script>');
    // Se existir na resposta, deve estar escapada
    if (res.body.item.observation?.includes('script')) {
      expect(res.body.item.observation).toContain('&lt;');
    }
  });

  it('deve rejeitar ou escapar XSS com payload de evento HTML', async () => {
    const xssPayload = '<img src=x onerror=alert(1)>';
    const res = await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.foodProduct.id, quantity: 1, observation: xssPayload })
      .expect(201);

    expect(res.body.item.observation).not.toContain('<img');
  });

  it('deve rejeitar XSS em guestName no split payment', async () => {
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
      .send({ split: [{ guestName: '<img src=x onerror=alert(1)>', amount: 89.90 }] })
      .expect(200);

    const savedPayment = await prisma.splitPayment.findFirst({
      where: { orderId: order.id },
    });
    expect(savedPayment?.guestName).not.toContain('<img');
  });

  it('deve resistir a SQL injection em campos de texto (Prisma parametriza)', async () => {
    const sqlPayload = "'; DROP TABLE \"User\"; --";
    await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.foodProduct.id, quantity: 1, observation: sqlPayload })
      .expect(201);

    // Banco não deve ter sido corrompido
    const userCount = await prisma.user.count();
    expect(userCount).toBeGreaterThan(0);
  });

  it('deve resistir a SQL injection em campo de login (email)', async () => {
    const sqlEmail = "' OR '1'='1";
    const res = await server
      .post('/api/auth/owner/login')
      .send({ email: sqlEmail, password: 'qualquer' });

    // Deve rejeitar — não deve logar como qualquer usuário
    expect([400, 401]).toContain(res.status);
  });

  it('deve rejeitar XSS em nome de produto criado pelo dono', async () => {
    const xssName = '<script>document.cookie</script>';

    await server
      .post('/api/owner/products')
      .set('Cookie', `token=${ownerToken}`)
      .send({ name: xssName, price: 10.00, category: 'FOOD' })
      .expect(201);

    const product = await prisma.product.findFirst({
      where: { restaurantId: seed.restaurant.id, name: { contains: 'script' } },
    });

    if (product) {
      expect(product.name).not.toContain('<script>');
    }
  });

  it('deve rejeitar template injection em observação', async () => {
    const templatePayload = '{{7*7}}${7*7}';
    const res = await server
      .post(`/api/orders/${order.id}/items`)
      .set('Cookie', `token=${waiterToken}`)
      .send({ productId: seed.foodProduct.id, quantity: 1, observation: templatePayload })
      .expect(201);

    // Não deve avaliar a expressão — deve armazenar como string literal
    expect(res.body.item.observation).not.toBe('4949');
  });
});
