import type { Signer } from "ethers";
import { AUTH_URL } from "./config";

export type Challenge = {
  nonce: string;
  expiresAt: number;
  typedData: {
    domain: { name: string; version: string };
    types: { Message: Array<{ name: string; type: string }> };
    primaryType: string;
    message: { domain: string; wallet: string; nonce: string; message: string };
  };
};

export type Session = {
  userId: string;
  wallet: string;
  accessToken: string;
  cookie: string;
};

/** Value of the refresh cookie from a `Set-Cookie` header. */
export function refreshCookieOf(response: Response) {
  const setCookie = response.headers.get("set-cookie");
  const pair = setCookie?.split(";")[0];

  return pair ?? null;
}

export async function requestChallenge(wallet: string): Promise<Challenge> {
  const response = await fetch(`${AUTH_URL}/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet }),
  });

  const body = (await response.json()) as any;

  if (!response.ok) {
    throw new Error(`challenge error: ${JSON.stringify(body)}`);
  }

  return body as Challenge;
}

export async function authenticate(signer: Signer): Promise<Session> {
  const wallet = await signer.getAddress();
  const challenge = await requestChallenge(wallet);
  const { typedData } = challenge;

  const signature = await signer.signTypedData(
    typedData.domain,
    { Message: typedData.types.Message },
    typedData.message
  );

  const response = await fetch(`${AUTH_URL}/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, signature, nonce: challenge.nonce }),
  });

  const body = (await response.json()) as any;

  if (!response.ok) {
    throw new Error(`authenticate error: ${JSON.stringify(body)}`);
  }

  const cookie = refreshCookieOf(response);

  if (!cookie) throw new Error("authenticate error: no refresh cookie in the response");

  return {
    userId: body.userId as string,
    wallet: body.wallet as string,
    accessToken: body.accessToken as string,
    cookie,
  };
}
