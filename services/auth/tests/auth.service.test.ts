/**
 * Unit tests for AuthService.
 *
 * Scope: the service layer only. Repositories are replaced with in-memory
 * fakes (tests/fakes/*.fake.ts), so these tests need no database, no broker
 * and no network. Wallet signatures are real EIP-712 signatures produced by
 * locally generated ethers wallets. Run with `bun test` from services/auth.
 */
import { afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import { AuthService } from '../src/services/auth.service';
import { SessionsJwt } from '@shared/sessions/src/sessionsJwt';
import type { UserRepository } from '../src/repositories/user.repository';
import type { SessionRepository } from '../src/repositories/session.repository';
import type { ChallengeRepository } from '../src/repositories/challenge.repository';
import { createFakeUserRepository, type FakeUserRepository } from './fakes/user.repository.fake';
import { createFakeSessionRepository, type FakeSessionRepository } from './fakes/session.repository.fake';
import { createFakeChallengeRepository, type FakeChallengeRepository } from './fakes/challenge.repository.fake';

const JWT_SECRET = 'unit-test-jwt-secret';
const ACCESS_TOKEN_EXPIRY = 900;
const REFRESH_TOKEN_EXPIRY = 604800;
const DOMAIN_NAME = 'RWA Platform';
const DOMAIN_VERSION = '1';
const SIGN_DOMAIN = 'rwa.local';
const CHALLENGE_TTL_SECONDS = 180;
const COOKIE_NAME = '__Secure-rwa_refresh';
const COOKIE_MAX_AGE = 604800;
const COOKIE_SECURE = true;
const COOKIE_PATH = '/api/auth';

const nowSeconds = () => Math.floor(Date.now() / 1000);

const signedHeaders = () => ({}) as Record<string, unknown>;

function cookieHeaderFrom(headers: Record<string, unknown>) {
  const setCookie = String(headers['Set-Cookie'] ?? '');
  const pair = setCookie.split(';')[0];

  return pair || null;
}

describe('AuthService (unit, fake repositories)', () => {
  let users: FakeUserRepository;
  let sessions: FakeSessionRepository;
  let challenges: FakeChallengeRepository;
  let service: AuthService;

  beforeEach(() => {
    users = createFakeUserRepository();
    sessions = createFakeSessionRepository();
    challenges = createFakeChallengeRepository();
    service = new AuthService(
      users as unknown as UserRepository,
      sessions as unknown as SessionRepository,
      challenges as unknown as ChallengeRepository,
      new SessionsJwt(JWT_SECRET),
      ACCESS_TOKEN_EXPIRY,
      REFRESH_TOKEN_EXPIRY,
      DOMAIN_NAME,
      DOMAIN_VERSION,
      SIGN_DOMAIN,
      CHALLENGE_TTL_SECONDS,
      COOKIE_NAME,
      COOKIE_MAX_AGE,
      COOKIE_SECURE,
      COOKIE_PATH,
    );
  });

  afterEach(() => {
    setSystemTime();
  });

  async function sign(signer: ethers.HDNodeWallet, challenge: { typedData: any; nonce: string }) {
    const signature = await signer.signTypedData(
      challenge.typedData.domain,
      { Message: challenge.typedData.types.Message },
      challenge.typedData.message,
    );

    return { wallet: signer.address, signature, nonce: challenge.nonce };
  }

  async function login(signer: ethers.HDNodeWallet, headers = signedHeaders()) {
    const challenge = await service.createChallenge(signer.address);
    const result = await service.authenticate(await sign(signer, challenge), headers);

    return { result, headers, challenge };
  }

  test('createChallenge: returns a nonce, an expiry and the typed data to sign', async () => {
    const wallet = ethers.Wallet.createRandom();

    const challenge = await service.createChallenge(wallet.address);

    expect(challenge.nonce).toHaveLength(64);
    expect(challenge.expiresAt).toBeGreaterThan(nowSeconds());
    expect(challenge.typedData.message).toMatchObject({
      domain: SIGN_DOMAIN,
      wallet: wallet.address,
      nonce: challenge.nonce,
    });
    expect(challenges.store.size).toBe(1);
  });

  test('authenticate: verifies a real EIP-712 signature and sets the refresh cookie', async () => {
    const wallet = ethers.Wallet.createRandom();
    const headers = signedHeaders();

    const { result } = await login(wallet, headers);

    expect(users.findOrCreate).toHaveBeenCalledWith(wallet.address);
    expect(typeof result.userId).toBe('string');
    expect(result.userId).toHaveLength(24);
    expect(result.wallet).toBe(wallet.address.toLowerCase());
    expect(typeof result.accessToken).toBe('string');
    expect(result).not.toHaveProperty('refreshToken');
    expect(String(headers['Set-Cookie'])).toStartWith(`${COOKIE_NAME}=`);
    expect(String(headers['Set-Cookie'])).toContain(`Path=${COOKIE_PATH}`);
    expect(String(headers['Set-Cookie'])).toContain('HttpOnly');
  });

  test('authenticate: the consumed challenge stores the session with the token jti', async () => {
    const wallet = ethers.Wallet.createRandom();
    const headers = signedHeaders();

    const { result } = await login(wallet, headers);

    const refreshToken = decodeURIComponent(String(headers['Set-Cookie']).split(';')[0].split('=').slice(1).join('='));
    const payload = jwt.decode(refreshToken) as any;

    expect(challenges.store.size).toBe(0);
    expect(sessions.create).toHaveBeenCalledTimes(1);

    const [userIdArg, sessionKeyArg, jtiArg, expiresAtArg] = sessions.create.mock.calls[0];
    expect(userIdArg).toBe(result.userId);
    expect(sessionKeyArg).toBe(payload.sessionKey);
    expect(jtiArg).toBe(payload.jti);
    expect(expiresAtArg).toBe(payload.exp);
  });

  test('authenticate: access and refresh tokens carry the expected payloads', async () => {
    const wallet = ethers.Wallet.createRandom();
    const headers = signedHeaders();

    const { result } = await login(wallet, headers);

    const refreshToken = decodeURIComponent(String(headers['Set-Cookie']).split(';')[0].split('=').slice(1).join('='));
    const accessPayload = jwt.decode(result.accessToken) as any;
    const refreshPayload = jwt.decode(refreshToken) as any;

    expect(accessPayload).toMatchObject({ userId: result.userId, wallet: wallet.address, type: 'access' });
    expect(refreshPayload).toMatchObject({ userId: result.userId, wallet: wallet.address, type: 'refresh' });
    expect(typeof refreshPayload.sessionKey).toBe('string');
    expect(typeof refreshPayload.jti).toBe('string');
    expect(refreshPayload.exp - refreshPayload.iat).toBe(REFRESH_TOKEN_EXPIRY);
    expect(() => jwt.verify(refreshToken, JWT_SECRET)).not.toThrow();
    expect(() => jwt.verify(refreshToken, 'another-secret')).toThrow();
  });

  test('authenticate: reuses the existing user record on the next call', async () => {
    const wallet = ethers.Wallet.createRandom();

    const first = await login(wallet);
    const second = await login(wallet);

    expect(second.result.userId).toBe(first.result.userId);
    expect(users.store.size).toBe(1);
    expect(users.findOrCreate).toHaveBeenCalledTimes(2);
  });

  test('authenticate: rejects an unknown nonce', async () => {
    const wallet = ethers.Wallet.createRandom();
    const challenge = await service.createChallenge(wallet.address);
    const payload = await sign(wallet, challenge);

    challenges.store.clear();

    await expect(service.authenticate(payload, signedHeaders())).rejects.toMatchObject({
      statusCode: 401,
      code: 'AUTHENTICATION_ERROR',
      message: 'Challenge not found or expired',
    });
  });

  test('authenticate: rejects a challenge issued for another wallet', async () => {
    const wallet = ethers.Wallet.createRandom();
    const other = ethers.Wallet.createRandom();

    const challenge = await service.createChallenge(other.address);
    const payload = await sign(wallet, challenge);

    await expect(service.authenticate(payload, signedHeaders())).rejects.toMatchObject({
      statusCode: 401,
      code: 'AUTHENTICATION_ERROR',
      message: 'Challenge wallet mismatch',
    });
  });

  test('authenticate: rejects an expired challenge', async () => {
    const wallet = ethers.Wallet.createRandom();
    const challenge = await service.createChallenge(wallet.address);

    const stored = challenges.store.get(challenge.nonce)!;
    stored.expiresAt = nowSeconds() - 1;

    await expect(service.authenticate(await sign(wallet, challenge), signedHeaders())).rejects.toMatchObject({
      statusCode: 401,
      code: 'AUTHENTICATION_ERROR',
      message: 'Challenge expired',
    });
  });

  test('authenticate: rejects a signature produced by another wallet', async () => {
    const wallet = ethers.Wallet.createRandom();
    const impostor = ethers.Wallet.createRandom();
    const challenge = await service.createChallenge(wallet.address);
    const signature = await impostor.signTypedData(
      challenge.typedData.domain,
      { Message: challenge.typedData.types.Message },
      challenge.typedData.message,
    );

    await expect(
      service.authenticate({ wallet: wallet.address, signature, nonce: challenge.nonce }, signedHeaders()),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: 'AUTHENTICATION_ERROR',
      message: 'Invalid signature',
    });

    expect(users.findOrCreate).toHaveBeenCalledTimes(0);
  });

  test('authenticate: rejects a malformed signature', async () => {
    const wallet = ethers.Wallet.createRandom();
    const challenge = await service.createChallenge(wallet.address);

    await expect(
      service.authenticate({ wallet: wallet.address, signature: 'not-a-signature', nonce: challenge.nonce }, signedHeaders()),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: 'AUTHENTICATION_ERROR',
      message: 'Invalid signature',
    });
  });

  test('authenticate: the same nonce cannot be used twice', async () => {
    const wallet = ethers.Wallet.createRandom();
    const challenge = await service.createChallenge(wallet.address);
    const payload = await sign(wallet, challenge);

    await service.authenticate(payload, signedHeaders());

    await expect(service.authenticate(payload, signedHeaders())).rejects.toMatchObject({
      statusCode: 401,
      code: 'AUTHENTICATION_ERROR',
      message: 'Challenge not found or expired',
    });

    expect(sessions.store.size).toBe(1);
  });

  test('refresh: rotates the token pair and sets a new cookie', async () => {
    const wallet = ethers.Wallet.createRandom();
    const headers = signedHeaders();
    const { result, challenge } = await login(wallet, headers);
    const refreshToken = cookieHeaderFrom(headers)!;

    const refreshHeaders = signedHeaders();
    const refreshed = await service.refresh(refreshHeaders, refreshToken);

    expect(refreshed.userId).toBe(result.userId);
    expect(refreshed.wallet).toBe(wallet.address.toLowerCase());
    expect(refreshed).not.toHaveProperty('refreshToken');
    expect(cookieHeaderFrom(refreshHeaders)).not.toBe(refreshToken);

    const stored = Array.from(sessions.store.values());
    expect(stored).toHaveLength(1);

    const newPayload = jwt.decode(decodeURIComponent(cookieHeaderFrom(refreshHeaders)!.split('=')[1])) as any;
    expect(newPayload.sessionKey).toBe(stored[0].sessionKey);
    expect(newPayload.jti).toBe(stored[0].jti);
    expect(newPayload.jti).not.toBe((jwt.decode(decodeURIComponent(refreshToken.split('=')[1])) as any).jti);
    expect(challenge).toBeDefined();
  });

  test('refresh: a rotated token is rejected and the session is dropped', async () => {
    const wallet = ethers.Wallet.createRandom();
    const headers = signedHeaders();
    await login(wallet, headers);
    const refreshToken = cookieHeaderFrom(headers)!;

    await service.refresh(signedHeaders(), refreshToken);

    const replayHeaders = signedHeaders();

    await expect(service.refresh(replayHeaders, refreshToken)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Invalid refresh session',
    });

    expect(sessions.store.size).toBe(0);
    expect(String(replayHeaders['Set-Cookie'])).toContain('Max-Age=0');
  });

  test('refresh: requires the cookie', async () => {
    await expect(service.refresh(signedHeaders(), null)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Refresh session required',
    });
  });

  test('refresh: rejects an access token presented as a refresh cookie', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { result } = await login(wallet);

    await expect(service.refresh(signedHeaders(), `${COOKIE_NAME}=${result.accessToken}`)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Invalid refresh session',
    });

    expect(sessions.findBySessionKey).toHaveBeenCalledTimes(0);
  });

  test('refresh: rejects a string that is not a JWT', async () => {
    await expect(service.refresh(signedHeaders(), `${COOKIE_NAME}=not-a-token`)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Invalid refresh session',
    });
  });

  test('refresh: a token signed with another secret is rejected', async () => {
    const wallet = ethers.Wallet.createRandom();
    await login(wallet);

    const foreign = jwt.sign(
      { userId: 'user', wallet: wallet.address, type: 'refresh', sessionKey: 'key', jti: 'jti' },
      'another-secret',
      { expiresIn: REFRESH_TOKEN_EXPIRY },
    );

    await expect(service.refresh(signedHeaders(), `${COOKIE_NAME}=${foreign}`)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Invalid refresh session',
    });

    expect(sessions.store.size).toBe(1);
  });

  test('getUser: returns the mapped user record', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { result } = await login(wallet);

    const user = await service.getUser(result.userId);

    expect(users.findById).toHaveBeenCalledWith(result.userId);
    expect(user).toEqual({
      userId: result.userId,
      wallet: wallet.address.toLowerCase(),
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
    expect(JSON.parse(JSON.stringify(user))).toEqual(user);
  });

  test('getUser: propagates NOT_FOUND for an unknown id', async () => {
    await expect(service.getUser('unknown-id')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  test('logout: clears the cookie and drops the presented session', async () => {
    const wallet = ethers.Wallet.createRandom();
    const first = await login(wallet, signedHeaders());
    await login(wallet, signedHeaders());

    const headers = signedHeaders();
    const result = await service.logout(headers, cookieHeaderFrom(first.headers)!);

    expect(result).toEqual({ ok: true });
    expect(String(headers['Set-Cookie'])).toContain('Max-Age=0');
    expect(sessions.store.size).toBe(1);
  });

  test('logout: a request without a cookie is still a success', async () => {
    const headers = signedHeaders();

    const result = await service.logout(headers, null);

    expect(result).toEqual({ ok: true });
    expect(String(headers['Set-Cookie'])).toContain('Max-Age=0');
  });

  test('logoutAll: drops every session of the user', async () => {
    const wallet = ethers.Wallet.createRandom();
    const first = await login(wallet, signedHeaders());
    await login(wallet, signedHeaders());

    const headers = signedHeaders();
    const result = await service.logoutAll(headers, cookieHeaderFrom(first.headers)!);

    expect(result).toEqual({ revokedCount: 2 });
    expect(sessions.deleteByUserId).toHaveBeenCalledWith(first.result.userId);
    expect(sessions.store.size).toBe(0);
    expect(String(headers['Set-Cookie'])).toContain('Max-Age=0');
  });

  test('logoutAll: does not touch other users', async () => {
    const wallet = ethers.Wallet.createRandom();
    const otherWallet = ethers.Wallet.createRandom();
    const auth = await login(wallet, signedHeaders());
    await login(otherWallet, signedHeaders());

    await service.logoutAll(signedHeaders(), cookieHeaderFrom(auth.headers)!);

    expect(sessions.store.size).toBe(1);
  });

  test('logoutAll: requires the cookie', async () => {
    await expect(service.logoutAll(signedHeaders(), null)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Refresh session required',
    });
  });
});
