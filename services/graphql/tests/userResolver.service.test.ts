/**
 * Unit tests for the shared SessionsJwt.
 *
 * resolveUser resolves the caller from a JWT only. The JWT path runs the real
 * jwt utils, so the env secret is set before the module under test is imported
 * (dynamic import below).
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import * as jwt from 'jsonwebtoken';

const TEST_SECRET = 'test-jwt-secret';
process.env.JWT_SECRET = TEST_SECRET;

const { SessionsJwt } = await import('@shared/sessions/src/sessionsJwt');

const sign = (payload: Record<string, unknown>) => jwt.sign(payload, TEST_SECRET, { expiresIn: 900 });

describe('SessionsJwt (unit)', () => {
  let service: InstanceType<typeof SessionsJwt>;

  beforeAll(() => {
    service = new SessionsJwt(TEST_SECRET);
  });

  test('returns null without a token', async () => {
    expect(service.resolveUser(null)).toBeNull();
  });

  test('resolves an access token into { userId, wallet }', async () => {
    const token = sign({ userId: 'u1', wallet: '0xw', type: 'access' });

    expect(service.resolveUser(token)).toEqual({ userId: 'u1', wallet: '0xw' });
  });

  test('a refresh token resolves to null', async () => {
    const token = sign({ userId: 'u1', wallet: '0xw', type: 'refresh' });

    expect(service.resolveUser(token)).toBeNull();
  });

  test('garbage resolves to null', async () => {
    expect(service.resolveUser('not-a-jwt')).toBeNull();
  });

  test('an opaque token that is not a JWT resolves to null', async () => {
    expect(service.resolveUser('opaque-token-abc')).toBeNull();
  });

  test('a token signed with another secret resolves to null', async () => {
    const token = jwt.sign({ userId: 'u1', wallet: '0xw', type: 'access' }, 'other-secret', { expiresIn: 900 });

    expect(service.resolveUser(token)).toBeNull();
  });
});
