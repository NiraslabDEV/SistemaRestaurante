import { FastifyRequest, FastifyReply } from 'fastify';

type Role = 'WAITER' | 'KITCHEN' | 'BAR' | 'OWNER';

export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      reply.status(401).send({ message: 'Autenticação necessária' });
      return;
    }

    if (!roles.includes(request.user.role as Role)) {
      reply.status(403).send({ message: 'Acesso negado' });
    }
  };
}
