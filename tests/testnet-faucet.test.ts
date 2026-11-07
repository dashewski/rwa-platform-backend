import { expect, test, describe, beforeAll } from "bun:test";
import { ethers, HDNodeWallet } from "ethers";
import { TESTNET_RPC, PLATFORM_TOKEN_ADDRESS } from "./utils/config";
import { makeGraphQLRequest } from "./utils/graphql/makeGraphQLRequest";
import { REQUEST_GAS, REQUEST_HOLD, REQUEST_PLATFORM, GET_HISTORY, GET_UNLOCK_TIME } from "./utils/graphql/schema/testnet-faucet";
import { authenticate } from "./utils/authenticate";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];


describe("Testnet Faucet Flow Tests", () => {
  let wallet: HDNodeWallet
  let accessToken: string;
  let userId: string;
  let gasRequestId: string;
  let holdRequestId: string;
  let platformRequestId: string;
  let platformAmount: number;

  beforeAll(async () => {
    wallet = ethers.Wallet.createRandom();
    ({ accessToken, userId } = await authenticate(wallet))
  })

  test("should request gas token", async () => {
    const amount = 0.0001
    const result = await makeGraphQLRequest(
      REQUEST_GAS,
      {
        input: {
          amount
        },
      },
      accessToken
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.requestGas).toBeDefined();
    expect(result.data.requestGas.userId).toBe(userId);
    expect(result.data.requestGas.wallet).toBe(wallet.address.toLowerCase());
    expect(result.data.requestGas.tokenType).toBe("gas");
    expect(result.data.requestGas.amount).toBe(amount);
    expect(result.data.requestGas.transactionHash).toBeDefined();

    gasRequestId = result.data.requestGas.id;
  });
  
  test("should request hold token", async () => {
    const amount = 10
    const result = await makeGraphQLRequest(
      REQUEST_HOLD,
      {
        input: {
          amount
        },
      },
      accessToken
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.requestHold).toBeDefined();
    expect(result.data.requestHold.userId).toBe(userId);
    expect(result.data.requestHold.wallet).toBe(wallet.address.toLowerCase());
    expect(result.data.requestHold.tokenType).toBe("hold");
    expect(result.data.requestHold.amount).toBe(amount);
    expect(result.data.requestHold.transactionHash).toBeDefined();

    holdRequestId = result.data.requestHold.id;
  });

  test("should request platform token", async () => {
    const amount = 10;
    const result = await makeGraphQLRequest(
      REQUEST_PLATFORM,
      {
        input: {
          amount,
        },
      },
      accessToken
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.requestPlatform).toBeDefined();
    expect(result.data.requestPlatform.userId).toBe(userId);
    expect(result.data.requestPlatform.wallet).toBe(wallet.address.toLowerCase());
    expect(result.data.requestPlatform.tokenType).toBe("platform");
    expect(result.data.requestPlatform.amount).toBe(amount);
    expect(result.data.requestPlatform.transactionHash).toBeDefined();

    platformRequestId = result.data.requestPlatform.id;
    platformAmount = result.data.requestPlatform.amount;
  }, 90000);

  test("should credit the platform tokens to the wallet on chain", async () => {
    const provider = new ethers.JsonRpcProvider(TESTNET_RPC);
    const platformToken = new ethers.Contract(PLATFORM_TOKEN_ADDRESS, ERC20_ABI, provider);
    const decimals = await platformToken.decimals();
    const expected = ethers.parseUnits(String(platformAmount), decimals);

    let balance = BigInt(0);
    for (let attempt = 0; attempt < 6; attempt++) {
      balance = await platformToken.balanceOf(wallet.address);
      if (balance === expected) break;
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }

    expect(balance).toBe(expected);
    provider.destroy();
  }, 60000);

  test("should get request history", async () => {
    const result = await makeGraphQLRequest(
      GET_HISTORY,
      {
        pagination: {
          limit: 10,
          offset: 0,
        },
      },
      accessToken
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.getHistory).toBeDefined();
    expect(Array.isArray(result.data.getHistory)).toBe(true);
    expect(result.data.getHistory.length).toBe(3); // Gas, Hold and Platform requests

    // Check requests order (oldest first)
    const requests = result.data.getHistory;
    expect(requests[0].id).toBe(gasRequestId);
    expect(requests[1].id).toBe(holdRequestId);
    expect(requests[2].id).toBe(platformRequestId);
  });

  test("should get unlock time", async () => {
    const result = await makeGraphQLRequest(
      GET_UNLOCK_TIME,
      {},
      accessToken
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.getUnlockTime).toBeDefined();
    expect(typeof result.data.getUnlockTime.gasUnlockTime).toBe("number");
    expect(typeof result.data.getUnlockTime.holdUnlockTime).toBe("number");
    expect(typeof result.data.getUnlockTime.platformUnlockTime).toBe("number");

    // All three token types were requested above, so every cooldown is armed.
    expect(result.data.getUnlockTime.gasUnlockTime).toBeGreaterThan(0);
    expect(result.data.getUnlockTime.holdUnlockTime).toBeGreaterThan(0);
    expect(result.data.getUnlockTime.platformUnlockTime).toBeGreaterThan(0);

    // The cooldown is an absolute timestamp and must not move between calls.
    const second = await makeGraphQLRequest(GET_UNLOCK_TIME, {}, accessToken);
    expect(second.data.getUnlockTime.gasUnlockTime).toBe(result.data.getUnlockTime.gasUnlockTime);
    expect(second.data.getUnlockTime.holdUnlockTime).toBe(result.data.getUnlockTime.holdUnlockTime);
    expect(second.data.getUnlockTime.platformUnlockTime).toBe(result.data.getUnlockTime.platformUnlockTime);
  });

  test("should reject a repeated request within the cooldown", async () => {
    const result = await makeGraphQLRequest(
      REQUEST_GAS,
      {
        input: {
          amount: 0.0001,
        },
      },
      accessToken
    );

    expect(result.errors).toBeDefined();
    expect(result.data?.requestGas).toBeFalsy();
  });

  test("should fail operations without auth", async () => {
    // Test request gas
    const gasAmount = 0.00001
    const holdAmount = 0.00001
    let result = await makeGraphQLRequest(REQUEST_GAS, {
      input: {
        amount: gasAmount,
      },
    });
    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toBe("Authentication required");

    // Test request hold
    result = await makeGraphQLRequest(REQUEST_HOLD, {
      input: {
        amount: holdAmount,
      },
    });
    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toBe("Authentication required");

    // Test request platform
    result = await makeGraphQLRequest(REQUEST_PLATFORM, {
      input: {
        amount: 10,
      },
    });
    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toBe("Authentication required");

    // Test get history
    result = await makeGraphQLRequest(GET_HISTORY, {
      pagination: {
        limit: 10,
        offset: 0,
      },
    });
    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toBe("Authentication required");

    // Test get unlock time
    result = await makeGraphQLRequest(GET_UNLOCK_TIME, {});
    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toBe("Authentication required");
  });
});