import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { AppError } from '@shared/errors/app-errors';

export interface AccessTokenPayload {
  userId: string;
  wallet: string;
  type: 'access';
  jti?: string;
}

export interface RefreshTokenPayload {
  userId: string;
  wallet: string;
  type: 'refresh';
  sessionKey: string;
  jti: string;
}

export type ExpiresIn = jwt.SignOptions['expiresIn'];

export class SessionsJwt {
  constructor(private readonly secret: string) {}

  parseToken(header: string | null): string | null {
    return header?.startsWith('Bearer ') ? header.slice(7) : null;
  }

  resolveUser(token: string | null): { userId: string; wallet: string } | null {
    if (!token) return null;

    try {
      const payload = this.verifyAccessToken(token);

      return { userId: payload.userId, wallet: payload.wallet };
    } catch {
      return null;
    }
  }

  signAccessToken(payload: { userId: string; wallet: string }, expiresIn: ExpiresIn): string {
    return jwt.sign(
      { ...payload, type: 'access', jti: crypto.randomBytes(16).toString('hex') },
      this.secret,
      { expiresIn },
    );
  }

  signRefreshToken(
    payload: { userId: string; wallet: string; sessionKey: string; jti: string },
    expiresIn: ExpiresIn,
  ): string {
    return jwt.sign({ ...payload, type: 'refresh' }, this.secret, { expiresIn });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const payload = this.verify(token, 'access');

    if (!payload.userId || !payload.wallet) {
      throw this.invalid();
    }

    return payload as AccessTokenPayload;
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    const payload = this.verify(token, 'refresh');

    if (!payload.sessionKey || !payload.jti) {
      throw this.invalid();
    }

    return payload as RefreshTokenPayload;
  }

  decodeExpiration(token: string): number {
    const decoded = jwt.decode(token) as { exp?: number } | null;

    if (!decoded?.exp) {
      throw this.invalid();
    }

    return decoded.exp;
  }

  private verify(token: string, expectedType: 'access' | 'refresh') {
    let payload: jwt.JwtPayload;

    try {
      payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    } catch (error) {
      // Malformed/expired tokens are normalized to the public auth error.
      throw new AppError({
        message: error instanceof jwt.TokenExpiredError ? 'Token expired' : 'Invalid token',
        statusCode: 401,
        code: error instanceof jwt.TokenExpiredError ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      });
    }

    if (payload.type !== expectedType) {
      throw new AppError({
        message: 'Invalid token type',
        statusCode: 401,
        code: 'TOKEN_INVALID',
      });
    }

    return payload;
  }

  private invalid() {
    return new AppError({ message: 'Invalid token', statusCode: 401, code: 'TOKEN_INVALID' });
  }
}
