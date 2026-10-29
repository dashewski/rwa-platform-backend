/**
 * Integration tests for the auth contour: `POST /api/auth/*` with the server
 * issued EIP-712 challenge, refresh in an HttpOnly cookie and rotating session.
 *
 * The stand must be up (`bun run app:up`). Run:
 *
 *   bun --env-file=infrastructure/docker/.env test --timeout=60000 tests/auth.test.ts
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { ethers, type HDNodeWallet } from "ethers";
import { AUTH_URL } from "./utils/config";
import { authenticate, refreshCookieOf, requestChallenge, type Session } from "./utils/authenticate";
import { makeGraphQLRequest } from "./utils/graphql/makeGraphQLRequest";

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? "__Secure-rwa_refresh";

const USER_ASSISTANTS_QUERY = `
  query GetUserAssistants($pagination: PaginationInput!) {
    getUserAssistants(pagination: $pagination) {
      id
    }
  }
`;

const PAGINATION = { pagination: { limit: 1, offset: 0 } };

async function graphql(query: string, variables: Record<string, unknown>, token?: string) {
  return makeGraphQLRequest(query, variables, token);
}

async function post(path: string, body?: unknown, cookie?: string | null) {
  const headers: Record<string, string> = {};

  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;

  const response = await fetch(`${AUTH_URL}${path}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return {
    status: response.status,
    body: (await response.json()) as any,
    cookie: refreshCookieOf(response),
    setCookie: response.headers.get("set-cookie") ?? "",
  };
}

async function sign(signer: HDNodeWallet, challenge: Awaited<ReturnType<typeof requestChallenge>>) {
  const { typedData } = challenge;
  const signature = await signer.signTypedData(
    typedData.domain,
    { Message: typedData.types.Message },
    typedData.message
  );

  return { wallet: signer.address, signature, nonce: challenge.nonce };
}

describe("Auth Flow Tests", () => {
  let wallet: HDNodeWallet;
  let session: Session;

  beforeAll(async () => {
    wallet = ethers.Wallet.createRandom();
    session = await authenticate(wallet);
  });

  test("challenge: returns a nonce and the typed data bound to the wallet", async () => {
    const challenge = await requestChallenge(wallet.address);

    expect(typeof challenge.nonce).toBe("string");
    expect(challenge.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(challenge.typedData.message.wallet).toBe(wallet.address);
    expect(challenge.typedData.message.nonce).toBe(challenge.nonce);
  });

  test("authenticate: returns the session and sets the refresh cookie", async () => {
    expect(session.wallet).toBe(wallet.address.toLowerCase());
    expect(session.userId).toHaveLength(24);
    expect(typeof session.accessToken).toBe("string");
    expect(session.cookie.startsWith(`${COOKIE_NAME}=`)).toBe(true);
  });

  test("authenticate: a nonce cannot be replayed", async () => {
    const challenge = await requestChallenge(wallet.address);
    const payload = await sign(wallet, challenge);

    const first = await post("/authenticate", payload);
    const replay = await post("/authenticate", payload);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(401);
    expect(replay.body.error.message).toBe("Challenge not found or expired");
  });

  test("authenticate: a signature from another wallet is rejected", async () => {
    const impostor = ethers.Wallet.createRandom();
    const challenge = await requestChallenge(wallet.address);
    const signature = await impostor.signTypedData(
      challenge.typedData.domain,
      { Message: challenge.typedData.types.Message },
      challenge.typedData.message
    );

    const response = await post("/authenticate", {
      wallet: wallet.address,
      signature,
      nonce: challenge.nonce,
    });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("Invalid signature");
  });

  test("authenticate: a challenge of another wallet is rejected", async () => {
    const other = ethers.Wallet.createRandom();
    const challenge = await requestChallenge(other.address);
    const payload = await sign(wallet, challenge);

    const response = await post("/authenticate", payload);

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("Challenge wallet mismatch");
  });

  test("refresh: rotates the pair through the cookie", async () => {
    const current = await authenticate(wallet);
    const refreshed = await post("/refresh", undefined, current.cookie);

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.userId).toBe(current.userId);
    expect(refreshed.body.wallet).toBe(wallet.address.toLowerCase());
    expect(refreshed.body.accessToken).not.toBe(current.accessToken);
    expect(refreshed.cookie).not.toBe(current.cookie);
  });

  test("refresh: a rotated cookie is rejected and the session is revoked", async () => {
    const current = await authenticate(wallet);
    const refreshed = await post("/refresh", undefined, current.cookie);

    expect(refreshed.status).toBe(200);

    const reuse = await post("/refresh", undefined, current.cookie);

    expect(reuse.status).toBe(401);
    expect(reuse.body.error.message).toBe("Invalid refresh session");

    // The session is gone: the rotated cookie no longer works either.
    const afterReuse = await post("/refresh", undefined, refreshed.cookie);

    expect(afterReuse.status).toBe(401);
  });

  test("refresh: a request without the cookie is rejected", async () => {
    const response = await post("/refresh");

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("Refresh session required");
  });

  test("logout: clears the cookie and drops the session", async () => {
    const current = await authenticate(wallet);

    const response = await post("/logout", undefined, current.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(response.setCookie).toContain("Max-Age=0");

    const refreshAfterLogout = await post("/refresh", undefined, current.cookie);

    expect(refreshAfterLogout.status).toBe(401);
  });

  test("logout: a request without the cookie is still a success", async () => {
    const response = await post("/logout");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  test("logoutAll: revokes every session of the wallet", async () => {
    const first = await authenticate(wallet);
    const second = await authenticate(wallet);

    const response = await post("/logoutAll", undefined, first.cookie);

    expect(response.status).toBe(200);
    expect(response.body.revokedCount).toBeGreaterThanOrEqual(2);

    expect((await post("/refresh", undefined, second.cookie)).status).toBe(401);
  });

  test("logoutAll: a request without the cookie is rejected", async () => {
    const response = await post("/logoutAll");

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("Refresh session required");
  });

  test("access token: opens a protected query for the signed in wallet", async () => {
    const current = await authenticate(wallet);

    const authorized = await graphql(USER_ASSISTANTS_QUERY, PAGINATION, current.accessToken);

    expect(authorized.errors).toBeUndefined();
    expect(Array.isArray(authorized.data.getUserAssistants)).toBe(true);

    const anonymous = await graphql(USER_ASSISTANTS_QUERY, PAGINATION);

    expect(anonymous.errors?.[0].message).toBe("Authentication required");
  });

  test("cookie: is HttpOnly, Secure, Strict and scoped to the auth path", async () => {
    const challenge = await requestChallenge(wallet.address);
    const payload = await sign(wallet, challenge);

    const response = await post("/authenticate", payload);

    expect(response.status).toBe(200);
    expect(response.setCookie).toContain("HttpOnly");
    expect(response.setCookie).toContain("Secure");
    expect(response.setCookie).toContain("SameSite=Strict");
    expect(response.setCookie).toContain("Path=/api/auth");
  });

  test("two devices: signing out on one keeps the other session alive", async () => {
    const first = await authenticate(wallet);
    const second = await authenticate(wallet);

    expect((await post("/logout", undefined, first.cookie)).status).toBe(200);
    expect((await post("/refresh", undefined, second.cookie)).status).toBe(200);
  });

  test("two tabs refresh at the same time: the loser is treated as theft", async () => {
    const current = await authenticate(wallet);

    const [left, right] = await Promise.all([
      post("/refresh", undefined, current.cookie),
      post("/refresh", undefined, current.cookie),
    ]);

    const statuses = [left.status, right.status].sort();

    expect(statuses).toEqual([200, 401]);

    const winner = left.status === 200 ? left : right;

    expect((await post("/refresh", undefined, winner.cookie)).status).toBe(401);
  });

  test("logout: the access token stays valid until it expires", async () => {
    const current = await authenticate(wallet);

    await post("/logout", undefined, current.cookie);

    const response = await graphql(USER_ASSISTANTS_QUERY, PAGINATION, current.accessToken);

    expect(response.errors).toBeUndefined();
  });

  test("authenticate: a signature made for another domain is rejected", async () => {
    const challenge = await requestChallenge(wallet.address);
    const { typedData } = challenge;

    const signature = await wallet.signTypedData(
      typedData.domain,
      { Message: typedData.types.Message },
      { ...typedData.message, domain: "evil.example" }
    );

    const response = await post("/authenticate", {
      wallet: wallet.address,
      signature,
      nonce: challenge.nonce,
    });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("Invalid signature");
  });
});
