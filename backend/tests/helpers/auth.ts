import jwt from 'jsonwebtoken';

const TEST_SECRET = process.env.JWT_SECRET || 'test-secret-min-32-chars-for-hmac';

export interface TokenPayload {
  userId: string;
  role: string;
  restaurantId: string;
}

/** Gera JWT válido para testes */
export function generateJWT(user: TokenPayload, secret = TEST_SECRET): string {
  return jwt.sign(
    { userId: user.userId ?? (user as any).id, role: user.role, restaurantId: user.restaurantId },
    secret,
    { expiresIn: '8h' }
  );
}

/** Gera JWT com secret errado (deve ser rejeitado pelo server) */
export function generateInvalidJWT(user: TokenPayload): string {
  return generateJWT(user, 'secret-errado-que-nao-bate-com-o-env');
}

/** Gera JWT expirado */
export function generateExpiredJWT(user: TokenPayload): string {
  return jwt.sign(
    { userId: (user as any).id || user.userId, role: user.role, restaurantId: user.restaurantId },
    TEST_SECRET,
    { expiresIn: '-1s' }
  );
}

/** Formata cookie para uso no header das requests de teste */
export function cookieHeader(token: string): string {
  return `token=${token}`;
}
