/**
 * Component tests for the auth HTTP layer.
 *
 * The whole Elysia app is assembled in-process: real controllers and the real
 * AuthService, with repositories replaced by in-memory fakes. Requests go
 * through app.handle() — no port is bound, nothing is queried over the network.
 * Run with `bun test` from services/auth.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import jwt from 'jsonwebtoken';
import { Elysia } from 'elysia';
import { ethers } from 'ethers';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createServicesPlugin } from '../src/plugins/services.plugin';
import { createControllersPlugin } from '../src/plugins/controllers.plugin';
import type { RepositoriesPlugin } from '../src/plugins/repositories.plugin';
import { createFakeUserRepository, type FakeUserRepository } from './fakes/user.repository.fake';
import { createFakeSessionRepository, type FakeSessionRepository } from './fakes/session.repository.fake';
import { createFakeChallengeRepository, type FakeChallengeRepository } from './fakes/challenge.repository.fake';

const JWT_SECRET = 'component-test-jwt-secret';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const DOMAIN_NAME = 'RWA Platform';
const DOMAIN_VERSION = '1';
const SIGN_DOMAIN = 'rwa.local';
const CHALLENGE_TTL_SECONDS = 180;
const COOKIE_NAME = 'session';
const COOKIE_MAX_AGE = 604800;
const COOKIE_SECURE = false;
const COOKIE_PATH = '/api/auth';

function buildApp(users: FakeUserRepository, sessions: FakeSessionRepository, challenges: FakeChallengeRepository) {
  const repositoriesPlugin = new Elysia({ name: 'Repositories' })
    .decorate('userRepository', users)
    .decorate('sessionRepository', sessions)
    .decorate('challengeRepository', challenges);

  const servicesPlugin = createServicesPlugin(
    repositoriesPlugin as unknown as RepositoriesPlugin,
    JWT_SECRET,
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

  return new Elysia().onError(ErrorHandlerPlugin).use(createControllersPlugin(servicesPlugin));
}

type App = ReturnType<typeof buildApp>;

function cookieValue(setCookie: string | null) {
  return setCookie?.split(';')[0].split('=').slice(1).join('=') ?? null;
}

async function call(app: App, path: string, options: { body?: unknown; cookie?: string | null } = {}) {
  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  if (options.cookie) {
    headers.cookie = `${COOKIE_NAME}=${options.cookie}`;
  }

  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  );

  return {
    status: response.status,
    body: (await response.json()) as any,
    cookie: cookieValue(response.headers.get('set-cookie')),
    setCookie: response.headers.get('set-cookie'),
  };
}

describe('auth HTTP layer (component, fake repositories)', () => {
  let users: FakeUserRepository;
  let sessions: FakeSessionRepository;
  let challenges: FakeChallengeRepository;
  let app: App;

  beforeEach(() => {
    users = createFakeUserRepository();
    sessions = createFakeSessionRepository();
    challenges = createFakeChallengeRepository();
    app = buildApp(users, sessions, challenges);
  });

  async function signIn(wallet: ethers.HDNodeWallet) {
    const challenge = await call(app, '/challenge', { body: { wallet: wallet.address } });
    const signature = await wallet.signTypedData(
      challenge.body.typedData.domain,
      { Message: challenge.body.typedData.types.Message },
      challenge.body.typedData.message,
    );

    return await call(app, '/authenticate', {
      body: { wallet: wallet.address, signature, nonce: challenge.body.nonce },
    });
  }

  test('challenge: returns the nonce and typed data', async () => {
    const wallet = ethers.Wallet.createRandom();

    const response = await call(app, '/challenge', { body: { wallet: wallet.address } });

    expect(response.status).toBe(200);
    expect(typeof response.body.nonce).toBe('string');
    expect(response.body.typedData.message).toMatchObject({
      domain: SIGN_DOMAIN,
      wallet: wallet.address,
      nonce: response.body.nonce,
    });
  });

  test('challenge → authenticate → getUser round-trip', async () => {
    const wallet = ethers.Wallet.createRandom();

    const auth = await signIn(wallet);

    expect(auth.status).toBe(200);
    expect(auth.body.wallet).toBe(wallet.address.toLowerCase());
    expect(typeof auth.body.userId).toBe('string');
    expect(typeof auth.body.accessToken).toBe('string');
    expect(auth.body.refreshToken).toBeUndefined();
    expect(String(auth.setCookie)).toStartWith(`${COOKIE_NAME}=`);
    expect(users.store.size).toBe(1);

    const accessPayload = jwt.decode(auth.body.accessToken) as any;
    expect(accessPayload.type).toBe('access');
    expect(accessPayload.exp - accessPayload.iat).toBe(15 * 60);

    const user = await call(app, '/getUser', { body: { userId: auth.body.userId } });
    expect(user.status).toBe(200);
    expect(user.body).toMatchObject({ userId: auth.body.userId, wallet: wallet.address.toLowerCase() });
  });

  test('authenticate: the same wallet is not duplicated on repeated sign-in', async () => {
    const wallet = ethers.Wallet.createRandom();

    const first = await signIn(wallet);
    const second = await signIn(wallet);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.userId).toBe(first.body.userId);
    expect(users.store.size).toBe(1);
  });

  test('authenticate: a signature from another wallet maps to 401', async () => {
    const wallet = ethers.Wallet.createRandom();
    const impostor = ethers.Wallet.createRandom();

    const challenge = await call(app, '/challenge', { body: { wallet: wallet.address } });
    const signature = await impostor.signTypedData(
      challenge.body.typedData.domain,
      { Message: challenge.body.typedData.types.Message },
      challenge.body.typedData.message,
    );

    const response = await call(app, '/authenticate', {
      body: { wallet: wallet.address, signature, nonce: challenge.body.nonce },
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid signature' } });
    expect(users.findOrCreate).toHaveBeenCalledTimes(0);
    expect(sessions.create).toHaveBeenCalledTimes(0);
  });

  test('authenticate: an unknown nonce maps to 401', async () => {
    const wallet = ethers.Wallet.createRandom();
    const challenge = await call(app, '/challenge', { body: { wallet: wallet.address } });

    challenges.store.clear();

    const response = await call(app, '/authenticate', {
      body: { wallet: wallet.address, signature: '0x00', nonce: challenge.body.nonce },
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: 'AUTHENTICATION_ERROR', message: 'Challenge not found or expired' },
    });
  });

  test('authenticate: an invalid payload never reaches the repository', async () => {
    const response = await call(app, '/authenticate', { body: { wallet: '0x123' } });

    expect(response.status).not.toBe(200);
    expect(response.body.error).toBeDefined();
    expect(users.findOrCreate).toHaveBeenCalledTimes(0);
  });

  test('authenticate: the same nonce cannot be replayed', async () => {
    const wallet = ethers.Wallet.createRandom();
    const challenge = await call(app, '/challenge', { body: { wallet: wallet.address } });
    const signature = await wallet.signTypedData(
      challenge.body.typedData.domain,
      { Message: challenge.body.typedData.types.Message },
      challenge.body.typedData.message,
    );
    const payload = { wallet: wallet.address, signature, nonce: challenge.body.nonce };

    const first = await call(app, '/authenticate', { body: payload });
    const replay = await call(app, '/authenticate', { body: payload });

    expect(first.status).toBe(200);
    expect(replay.status).toBe(401);
    expect(replay.body).toEqual({
      error: { code: 'AUTHENTICATION_ERROR', message: 'Challenge not found or expired' },
    });
    expect(sessions.store.size).toBe(1);
  });

  test('refresh: rotates the pair, sets a new cookie and rejects the old one', async () => {
    const wallet = ethers.Wallet.createRandom();
    const auth = await signIn(wallet);

    const refreshed = await call(app, '/refresh', { cookie: auth.cookie });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.userId).toBe(auth.body.userId);
    expect(refreshed.body.wallet).toBe(wallet.address.toLowerCase());
    expect(refreshed.body.refreshToken).toBeUndefined();
    expect(refreshed.cookie).not.toBe(auth.cookie);

    const stored = Array.from(sessions.store.values());
    expect(stored).toHaveLength(1);
    expect((jwt.decode(refreshed.cookie as string) as any).jti).toBe(stored[0].jti);

    const reuse = await call(app, '/refresh', { cookie: auth.cookie });
    expect(reuse.status).toBe(401);
    expect(reuse.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Invalid refresh session' } });
    expect(String(reuse.setCookie)).toContain('Max-Age=0');
    expect(sessions.store.size).toBe(0);
  });

  test('refresh: a request without the cookie maps to 401', async () => {
    const response = await call(app, '/refresh');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Refresh session required' } });
  });

  test('refresh: an access token presented as the cookie maps to 401', async () => {
    const wallet = ethers.Wallet.createRandom();
    const auth = await signIn(wallet);

    const response = await call(app, '/refresh', { cookie: auth.body.accessToken });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Invalid refresh session' } });
    expect(sessions.findBySessionKey).toHaveBeenCalledTimes(0);
  });

  test('getUser: an unknown id maps to 404 NOT_FOUND', async () => {
    const response = await call(app, '/getUser', { body: { userId: 'unknown-id' } });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'User unknown-id not found' } });
  });

  test('logout: revokes the session from the cookie and clears it', async () => {
    const wallet = ethers.Wallet.createRandom();
    const first = await signIn(wallet);
    const second = await signIn(wallet);

    const response = await call(app, '/logout', { cookie: first.cookie });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(String(response.setCookie)).toContain('Max-Age=0');
    expect(sessions.store.size).toBe(1);
    expect(Array.from(sessions.store.values())[0].sessionKey).toBe(
      (jwt.decode(second.cookie as string) as any).sessionKey,
    );
  });

  test('logout: an invalid cookie is ignored, the cookie is still cleared', async () => {
    const response = await call(app, '/logout', { cookie: 'not-a-token' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(String(response.setCookie)).toContain('Max-Age=0');
  });

  test('logoutAll: revokes every session of the user', async () => {
    const wallet = ethers.Wallet.createRandom();
    const first = await signIn(wallet);
    await signIn(wallet);

    const response = await call(app, '/logoutAll', { cookie: first.cookie });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ revokedCount: 2 });
    expect(sessions.store.size).toBe(0);
    expect(String(response.setCookie)).toContain('Max-Age=0');
  });

  test('logoutAll: a request without the cookie maps to 401', async () => {
    const response = await call(app, '/logoutAll');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Refresh session required' } });
  });
});
