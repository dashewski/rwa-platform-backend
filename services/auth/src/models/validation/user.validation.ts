import { t } from 'elysia';

/*
 * Base model schema
 */
export const userSchema = t.Object({
  userId: t.String(),
  wallet: t.String({ minLength: 1 }),
  createdAt: t.Number(),
  updatedAt: t.Number(),
});

/*
 * Authenticate
 */
export const authenticateRequest = t.Object({
  wallet: t.String({ minLength: 1 }),
  signature: t.String({ minLength: 1 }),
  nonce: t.String({ minLength: 1 }),
});

/*
 * Challenge
 */
export const challengeRequest = t.Object({
  wallet: t.String({ minLength: 1 }),
});

export const challengeResponse = t.Object({
  nonce: t.String(),
  expiresAt: t.Number(),
  typedData: t.Object({
    domain: t.Object({
      name: t.String(),
      version: t.String(),
    }),
    types: t.Object({
      EIP712Domain: t.Array(t.Object({ name: t.String(), type: t.String() })),
      Message: t.Array(t.Object({ name: t.String(), type: t.String() })),
    }),
    primaryType: t.String(),
    message: t.Object({
      domain: t.String(),
      wallet: t.String(),
      nonce: t.String(),
      message: t.String(),
    }),
  }),
});

export const authenticateResponse = t.Object({
  userId: t.String(),
  wallet: t.String(),
  accessToken: t.String(),
  refreshToken: t.String(),
});

export const sessionResponse = t.Object({
  userId: t.String(),
  wallet: t.String(),
  accessToken: t.String(),
});

export const logoutCookieResponse = t.Object({
  ok: t.Boolean(),
});

/*
 * Get user
 */
export const getUserRequest = t.Object({
  userId: t.String({ minLength: 1 }),
});

export const getUserResponse = userSchema;

/*
 * Logout all
 */
export const logoutResponse = t.Object({
  revokedCount: t.Number(),
});

