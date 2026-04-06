import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyJWT, JWTPayload } from '../utils/crypto';
import { UnauthorizedError } from '../utils/errors';

declare module 'fastify' {
  interface FastifyRequest {
    user: JWTPayload;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.cookies?.token;

  if (!token) {
    reply.status(401).send({ message: 'Autenticação necessária' });
    return;
  }

  try {
    request.user = verifyJWT(token);
  } catch {
    reply.status(401).send({ message: 'Token inválido ou expirado' });
  }
}
