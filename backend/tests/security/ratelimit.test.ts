import { getTestServer, seedRestaurant } from '../setup';

describe('Segurança – Rate Limiting', () => {
  let server: any;
  let seed: any;

  beforeEach(async () => {
    server = await getTestServer();
    seed = await seedRestaurant();
  });

  it('deve retornar 429 após exceder limite de tentativas de login de garçom', async () => {
    const requests = Array.from({ length: 55 }, () =>
      server
        .post('/api/auth/waiter/login')
        .send({ pin: '9999', waiterId: seed.waiter.id })
    );

    const results = await Promise.all(requests);
    const rateLimited = results.some(r => r.status === 429);
    expect(rateLimited).toBe(true);
  });

  it('deve retornar 429 após exceder limite de tentativas de login de dono', async () => {
    const requests = Array.from({ length: 55 }, () =>
      server
        .post('/api/auth/owner/login')
        .send({ email: 'dono@teste.com', password: 'senhaerrada' })
    );

    const results = await Promise.all(requests);
    const rateLimited = results.some(r => r.status === 429);
    expect(rateLimited).toBe(true);
  });

  it('deve incluir header Retry-After na resposta 429', async () => {
    const requests = Array.from({ length: 55 }, () =>
      server
        .post('/api/auth/waiter/login')
        .send({ pin: '0000', waiterId: seed.waiter.id })
    );

    const results = await Promise.all(requests);
    const limitedRes = results.find(r => r.status === 429);

    if (limitedRes) {
      expect(
        limitedRes.headers['retry-after'] || limitedRes.headers['x-ratelimit-reset']
      ).toBeDefined();
    }
  });
});
