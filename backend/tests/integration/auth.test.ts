import { getTestServer, seedRestaurant, generateJWT } from '../setup';

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

    it('deve retornar mensagem de erro genérica (não revelar se PIN ou ID está errado)', async () => {
      const res = await server
        .post('/api/auth/waiter/login')
        .send({ pin: '9999', waiterId: seed.waiter.id })
        .expect(401);

      expect(res.body.message).not.toMatch(/pin|senha|password/i);
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

    it('deve retornar 401 com email inexistente (mesma mensagem que senha errada)', async () => {
      const resEmailInvalido = await server
        .post('/api/auth/owner/login')
        .send({ email: 'naoexiste@teste.com', password: 'owner123' });

      const resSenhaInvalida = await server
        .post('/api/auth/owner/login')
        .send({ email: 'dono@teste.com', password: 'wrong' });

      expect(resEmailInvalido.status).toBe(401);
      expect(resSenhaInvalida.status).toBe(401);
      // As mensagens devem ser idênticas (não revelar qual campo está errado)
      expect(resEmailInvalido.body.message).toBe(resSenhaInvalida.body.message);
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
      expect(cookie).toMatch(/token=;|token=$/);
      expect(cookie).toContain('Max-Age=0');
    });

    it('deve retornar 401 sem token', async () => {
      await server
        .post('/api/auth/logout')
        .expect(401);
    });
  });
});
