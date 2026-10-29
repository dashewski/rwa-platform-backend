import { ethers } from 'ethers';
import crypto from 'crypto';
import { AppError } from '@shared/errors/app-errors';
import { SessionsJwt, type ExpiresIn, type RefreshTokenPayload } from '@shared/sessions/src/sessionsJwt';
import { UserRepository } from '../repositories/user.repository';
import { SessionRepository } from '../repositories/session.repository';
import { ChallengeRepository } from '../repositories/challenge.repository';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';
import { setSpanAttributes } from '@shared/monitoring/src/tracing';
import { metrics } from '@shared/monitoring/src/metrics';

export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly challengeRepository: ChallengeRepository,
    private readonly sessionsJwt: SessionsJwt,
    private readonly accessTokenExpiry: ExpiresIn,
    private readonly refreshTokenExpiry: ExpiresIn,
    private readonly domainName: string,
    private readonly domainVersion: string,
    private readonly signDomain: string,
    private readonly challengeTtlSeconds: number,
    private readonly cookieName: string,
    private readonly cookieMaxAge: number,
    private readonly cookieSecure: boolean,
    private readonly cookiePath: string,
  ) { }

  async createChallenge(wallet: string) {
    const nonce = crypto.randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + this.challengeTtlSeconds;

    await this.challengeRepository.create({ nonce, wallet, expiresAt });

    return {
      nonce,
      expiresAt,
      typedData: this.buildTypedData(wallet, nonce),
    };
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      wallet: a[0].wallet,
      nonce: a[0].nonce,
    }),
  })
  async authenticate(data: { wallet: string; signature: string; nonce: string }, headers: Record<string, unknown>) {
    setSpanAttributes({ wallet: data.wallet });

    const challenge = await this.challengeRepository.consume(data.nonce);

    if (!challenge) {
      throw new AppError({
        message: 'Challenge not found or expired',
        statusCode: 401,
        code: 'AUTHENTICATION_ERROR',
      });
    }

    if (challenge.wallet.toLowerCase() !== data.wallet.toLowerCase()) {
      throw new AppError({
        message: 'Challenge wallet mismatch',
        statusCode: 401,
        code: 'AUTHENTICATION_ERROR',
      });
    }

    if (challenge.expiresAt <= Math.floor(Date.now() / 1000)) {
      throw new AppError({
        message: 'Challenge expired',
        statusCode: 401,
        code: 'AUTHENTICATION_ERROR',
      });
    }

    const typedData = this.buildTypedData(data.wallet, data.nonce);

    let isValid = false;

    try {
      const recovered = ethers.verifyTypedData(
        typedData.domain,
        { Message: typedData.types.Message },
        typedData.message,
        data.signature,
      );

      isValid = recovered.toLowerCase() === data.wallet.toLowerCase();
    } catch {
      isValid = false;
    }

    if (!isValid) {
      throw new AppError({
        message: 'Invalid signature',
        statusCode: 401,
        code: 'AUTHENTICATION_ERROR',
      });
    }

    const isNewUser = !(await this.userRepository.exists(data.wallet));

    const user = await this.userRepository.findOrCreate(data.wallet);

    if (isNewUser) {
      metrics.counter('auth_users_created_total');
    }

    const sessionKey = crypto.randomUUID();
    const jti = crypto.randomUUID();
    const tokens = this.generateTokens(data.wallet, user._id.toString(), sessionKey, jti);
    const session = await this.sessionRepository.create(
      user._id.toString(),
      sessionKey,
      jti,
      this.sessionsJwt.decodeExpiration(tokens.refreshToken),
    );

    if (!session) {
      throw new AppError({
        message: 'Duplicate session',
        statusCode: 401,
        code: 'AUTHENTICATION_ERROR',
      });
    }

    this.setRefreshCookie(headers, tokens.refreshToken);

    return {
      userId: user._id.toString(),
      wallet: user.wallet,
      accessToken: tokens.accessToken,
    };
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator()
  async refresh(headers: Record<string, unknown>, cookieHeader: string | null) {
    const refreshToken = this.parseRefreshCookie(cookieHeader);

    if (!refreshToken) {
      throw new AppError({ message: 'Refresh session required', statusCode: 401, code: 'UNAUTHORIZED' });
    }

    try {
      const data = await this.rotateRefreshToken(refreshToken);

      this.setRefreshCookie(headers, data.refreshToken);

      return {
        userId: data.userId,
        wallet: data.wallet,
        accessToken: data.accessToken,
      };
    } catch {
      this.clearRefreshCookie(headers);

      throw new AppError({ message: 'Invalid refresh session', statusCode: 401, code: 'UNAUTHORIZED' });
    }
  }

  @TraceDecorator()
  private async rotateRefreshToken(refreshToken: string) {
    const payload = this.parseRefreshToken(refreshToken);

    if (!payload.sessionKey || !payload.jti) {
      throw new AppError({
        message: 'Invalid refresh token',
        statusCode: 401,
        code: 'AUTHENTICATION_ERROR',
      });
    }

    setSpanAttributes({ wallet: payload.wallet });

    const record = await this.sessionRepository.findBySessionKey(payload.sessionKey);

    if (!record) {
      throw new AppError({
        message: 'Invalid refresh token',
        statusCode: 401,
        code: 'AUTHENTICATION_ERROR',
      });
    }

    if (payload.jti !== record.jti) {
      await this.sessionRepository.deleteBySessionKey(payload.sessionKey);

      throw new AppError({
        message: 'Refresh token reuse detected',
        statusCode: 401,
        code: 'AUTHENTICATION_ERROR',
      });
    }

    const user = await this.userRepository.findById(payload.userId);
    const sessionKey = payload.sessionKey;
    const newJti = crypto.randomUUID();
    const tokens = this.generateTokens(payload.wallet, user._id.toString(), sessionKey, newJti);
    const expiresAt = this.sessionsJwt.decodeExpiration(tokens.refreshToken);

    const rotated = await this.sessionRepository.rotate(sessionKey, record.jti, newJti, expiresAt);

    if (!rotated) {
      await this.sessionRepository.deleteBySessionKey(sessionKey);

      throw new AppError({
        message: 'Refresh token reuse detected',
        statusCode: 401,
        code: 'AUTHENTICATION_ERROR',
      });
    }

    return {
      userId: user._id.toString(),
      wallet: user.wallet,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  private buildTypedData(wallet: string, nonce: string) {
    return {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
        ],
        Message: [
          { name: 'domain', type: 'string' },
          { name: 'wallet', type: 'address' },
          { name: 'nonce', type: 'string' },
          { name: 'message', type: 'string' },
        ],
      },
      primaryType: 'Message' as const,
      domain: {
        name: this.domainName,
        version: this.domainVersion,
      },
      message: {
        domain: this.signDomain,
        wallet,
        nonce,
        message: `Welcome to RWA Platform!

We prioritize the security of your assets and personal data. To ensure secure access to your account, we kindly request you to verify ownership of your wallet by signing this message.`,
      },
    };
  }




  @TraceDecorator()
  private generateTokens(wallet: string, userId: string, sessionKey: string, jti: string) {
    return {
      accessToken: this.sessionsJwt.signAccessToken({ userId, wallet }, this.accessTokenExpiry),
      refreshToken: this.sessionsJwt.signRefreshToken(
        { userId, wallet, sessionKey, jti },
        this.refreshTokenExpiry,
      ),
    };
  }

  @TraceDecorator()
  private parseRefreshToken(token: string): RefreshTokenPayload {
    try {
      return this.sessionsJwt.verifyRefreshToken(token);
    } catch (error) {
      // Malformed/expired tokens and foreign token types share the public auth error.
      throw new AppError({
        message: error instanceof AppError && error.message === 'Invalid token type'
          ? 'Invalid token type'
          : 'Invalid refresh token',
        statusCode: 401,
        code: 'AUTHENTICATION_ERROR',
      });
    }
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ userId: a[0] }),
  })
  async getUser(userId: string) {
    setSpanAttributes({ userId });
    const user = await this.userRepository.findById(userId);

    return {
      userId: user._id.toString(),
      wallet: user.wallet,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator()
  async logout(headers: Record<string, unknown>, cookieHeader: string | null) {
    const refreshToken = this.parseRefreshCookie(cookieHeader);

    this.clearRefreshCookie(headers);

    if (refreshToken) {
      try {
        const payload = this.parseRefreshToken(refreshToken);

        if (payload.sessionKey) {
          await this.sessionRepository.deleteBySessionKey(payload.sessionKey);
        }
      } catch {
        // the session is already gone or the token is malformed
      }
    }

    return { ok: true };
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator()
  async logoutAll(headers: Record<string, unknown>, cookieHeader: string | null) {
    const refreshToken = this.parseRefreshCookie(cookieHeader);

    if (!refreshToken) {
      throw new AppError({ message: 'Refresh session required', statusCode: 401, code: 'UNAUTHORIZED' });
    }

    const payload = this.parseRefreshToken(refreshToken);

    setSpanAttributes({ wallet: payload.wallet });

    const revokedCount = await this.sessionRepository.deleteByUserId(payload.userId);

    this.clearRefreshCookie(headers);

    return { revokedCount };
  }

  private parseRefreshCookie(cookieHeader: string | null) {
    if (!cookieHeader) {
      return null;
    }

    for (const part of cookieHeader.split(';')) {
      const [key, ...value] = part.trim().split('=');

      if (key === this.cookieName) {
        return decodeURIComponent(value.join('='));
      }
    }

    return null;
  }

  private setRefreshCookie(headers: Record<string, unknown>, token: string) {
    headers['Set-Cookie'] =
      `${this.cookieName}=${encodeURIComponent(token)}; Path=${this.cookiePath}; Max-Age=${this.cookieMaxAge}; HttpOnly; SameSite=Strict` +
      (this.cookieSecure ? '; Secure' : '');
  }

  private clearRefreshCookie(headers: Record<string, unknown>) {
    headers['Set-Cookie'] =
      `${this.cookieName}=; Path=${this.cookiePath}; Max-Age=0; HttpOnly; SameSite=Strict` +
      (this.cookieSecure ? '; Secure' : '');
  }
}
