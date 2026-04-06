// Logger standalone — usado apenas em services e websocket handlers
// O app.ts usa o logger nativo do Fastify (evita conflito de tipos)
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: ['*.password', '*.pin'],
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});
