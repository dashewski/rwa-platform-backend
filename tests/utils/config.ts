process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const BASE_DOMAIN = 'rwa.local';

export const GATEWAY_URL = `https://${BASE_DOMAIN}/api/graphql`;
export const GATEWAY_REST_URL = `https://${BASE_DOMAIN}`;
export const AUTH_URL = `https://${BASE_DOMAIN}/api/auth`;

export const TESTNET_RPC =
  process.env.TESTNET_RPC ?? "http://127.0.0.1:8545";

export const FACTORY_ADDRESS = "0xF46A71cac8B1A8F734559Cc4367CD1546A1A29bF";
export const HOLD_TOKEN_ADDRESS = "0x1c0e214bB702572E5582085d6E25c39A2B13510d";
export const DAO_STAKING_ADDRESS = "0xAE7BdBAdF539123028De5b421D320DDD2B60d73F";
export const GOVERNANCE_ADDRESS = "0x75CC95365B588D511A43776715c29c2fB8873e8c";
export const PLATFORM_TOKEN_ADDRESS = "0xb85c84e68Ed64eE497D6d8AD98811Da20a9C02ab";
export const TIMELOCK_ADDRESS = "0xEE4B4338E22c542967334E4C0098fc42869f4750";
export const TREASURY_ADDRESS = "0x92d89379C79FD3Ad6127D841C8a36a98db4e05f0";
export const REFERRAL_TREASURY_ADDRESS = "0xcf56E77069cC2aBfA6c1Df9bfD4155F782697B9D";
export const CONFIG_ADDRESS = "0xd1161a9EAaFF8009511fC17ED0fC2fA2deA839c8";

// Testnet-faucet wallet on the stand (serves gas/token requests)
export const FAUCET_ADDRESS = "0x221F2cd0CD36Fb55eB8E3ACaA601c6e98D9980b8";
// Stand deployer account: wired into the local `node` network via env keys; holds the forked token supply
export const DEPLOYER_ADDRESS = "0xAA9A2BbCAAa096d17098582CF60098032CdCDc4b";
