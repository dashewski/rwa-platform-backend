/**
 * Unit tests for the shared SessionsJwt (@shared/sessions).
 *
 * Covers the contract every service relies on: access/refresh types are not
 * interchangeable, signatures and expiry are enforced, malformed input is
 * rejected with the public auth error.
 */
import { describe, expect, test } from 'bun:test';
import { SessionsJwt } from '@shared/sessions/src/sessionsJwt';

const TEST_SECRET = 'test-jwt-secret';
const OTHER_SECRET = 'another-test-secret';

const service = new SessionsJwt(TEST_SECRET);

describe('SessionsJwt (unit)', () => {
  test('signs and verifies an access token', () => {
    const token = service.signAccessToken({ userId: 'u1', wallet: '0xw' }, 900);
    const payload = service.verifyAccessToken(token);

    expect(payload.userId).toBe('u1');
    expect(payload.wallet).toBe('0xw');
    expect(payload.type).toBe('access');
  });

  test('signs and verifies a refresh token', () => {
    const token = service.signRefreshToken({ userId: 'u1', wallet: '0xw', sessionKey: 's1', jti: 'j1' }, 600);
    const payload = service.verifyRefreshToken(token);

    expect(payload.sessionKey).toBe('s1');
    expect(payload.jti).toBe('j1');
  });

  test('keeps access and refresh tokens apart', () => {
    const access = service.signAccessToken({ userId: 'u1', wallet: '0xw' }, 900);
    const refresh = service.signRefreshToken({ userId: 'u1', wallet: '0xw', sessionKey: 's1', jti: 'j1' }, 600);

    expect(() => service.verifyRefreshToken(access)).toThrow('Invalid token type');
    expect(() => service.verifyAccessToken(refresh)).toThrow('Invalid token type');
  });

  test('rejects an expired token', () => {
    const token = service.signAccessToken({ userId: 'u1', wallet: '0xw' }, -1);

    expect(() => service.verifyAccessToken(token)).toThrow('Token expired');
  });

  test('rejects a tampered payload', () => {
    const [header, , signature] = service.signAccessToken({ userId: 'u1', wallet: '0xw' }, 900).split('.');
    const forged = `${header}.${Buffer.from(JSON.stringify({ userId: 'attacker', wallet: '0xw', type: 'access' })).toString('base64url')}.${signature}`;

    expect(() => service.verifyAccessToken(forged)).toThrow('Invalid token');
  });

  test('rejects a token signed with another secret', () => {
    const token = new SessionsJwt(OTHER_SECRET).signAccessToken({ userId: 'u1', wallet: '0xw' }, 900);

    expect(() => service.verifyAccessToken(token)).toThrow('Invalid token');
  });

  test('rejects a token without session fields', () => {
    const token = service.signAccessToken({ userId: 'u1', wallet: '0xw' }, 900);

    expect(() => service.verifyRefreshToken(token)).toThrow('Invalid token type');
  });

  test('decodes expiration', () => {
    const token = service.signAccessToken({ userId: 'u1', wallet: '0xw' }, 900);
    const exp = service.decodeExpiration(token);

    expect(exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});
