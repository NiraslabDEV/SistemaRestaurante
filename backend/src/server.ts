import 'dotenv/config';
import { buildApp } from './app';
import { logger } from './utils/logger';

const PORT = parseInt(process.env.PORT || '3000', 10);

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    logger.info({ port: PORT }, 'Servidor iniciado');
  } catch (err) {
    logger.error(err, 'Falha ao iniciar servidor');
    process.exit(1);
  }
}

start();
