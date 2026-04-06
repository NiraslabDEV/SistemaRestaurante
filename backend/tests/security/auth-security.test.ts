import { getTestServer, seedRestaurant, generateJWT, prisma } from '../setup';

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

  it('401 – acessar rota com token manipulado', async () => {
    const validToken = generateJWT(seed.waiter);
    await server
      .post('/api/orders')
      .set('Cookie', `token=${validToken}invalid-suffix`)
      .send({ tableId: seed.table1.id, waiterId: seed.waiter.id })
      .expect(401);
  });

  it('401 – token com secret errado deve ser rejeitado', async () => {
    const fakeToken = generateJWT(seed.waiter, 'secret-errado-que-nao-e-o-correto-do-env');
    await server
      .post('/api/orders')
      .set('Cookie', `token=${fakeToken}`)
      .send({ tableId: seed.table1.id, waiterId: seed.waiter.id })
      .expect(401);
  });

  it('403 – garçom acessando rota exclusiva de dono', async () => {
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

  it('403 – garçom tentando criar produto (rota de dono)', async () => {
    const waiterToken = generateJWT(seed.waiter);
    await server
      .post('/api/owner/products')
      .set('Cookie', `token=${waiterToken}`)
      .send({ name: 'Produto Falso', price: 10.00, category: 'FOOD' })
      .expect(403);
  });

  it('403 – garçom tentando deletar garçom (rota de dono)', async () => {
    const waiterToken = generateJWT(seed.waiter);
    await server
      .delete(`/api/owner/workers/${seed.waiter.id}`)
      .set('Cookie', `token=${waiterToken}`)
      .expect(403);
  });

  it('deve usar bcrypt com salt >= 10 para PINs de garçom', async () => {
    const user = await prisma.user.findUnique({ where: { id: seed.waiter.id } });
    expect(user!.pin).toBeDefined();
    // bcrypt hash começa com $2b$<rounds>$
    const saltRounds = parseInt(user!.pin!.split('$')[2], 10);
    expect(saltRounds).toBeGreaterThanOrEqual(10);
  });

  it('deve usar bcrypt com salt >= 10 para senhas de dono', async () => {
    const owner = await prisma.user.findUnique({ where: { id: seed.owner.id } });
    expect(owner!.password).toBeDefined();
    const saltRounds = parseInt(owner!.password!.split('$')[2], 10);
    expect(saltRounds).toBeGreaterThanOrEqual(10);
  });
});
