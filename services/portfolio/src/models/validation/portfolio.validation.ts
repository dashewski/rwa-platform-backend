import { t } from 'elysia';

/*
 * Entity schemas
 */
export const tokenBalanceSchema = t.Object({
  id: t.String(),
  owner: t.String(),
  tokenAddress: t.String(),
  tokenId: t.String(),
  poolAddress: t.String(),
  chainId: t.String(),
  balance: t.Number(),
  lastUpdateBlock: t.Number(),
  createdAt: t.Number(),
  updatedAt: t.Number(),
});

export const transactionSchema = t.Object({
  id: t.String(),
  from: t.String(),
  to: t.String(),
  tokenAddress: t.String(),
  tokenId: t.String(),
  poolAddress: t.String(),
  chainId: t.String(),
  transactionHash: t.String(),
  logIndex: t.Number(),
  blockNumber: t.Number(),
  amount: t.Number(),
  createdAt: t.Number(),
  updatedAt: t.Number(),
});

/*
 * Get token balances
 */
export const getBalancesRequest = t.Object({
  filter: t.Optional(t.Record(t.String(), t.Any())),
  sort: t.Optional(t.Record(t.String(), t.Union([t.Literal('asc'), t.Literal('desc')]))),
  limit: t.Optional(t.Number()),
  offset: t.Optional(t.Number()),
});
export const getBalancesResponse = t.Array(tokenBalanceSchema);

/*
 * Get transactions
 */
export const getTransactionsRequest = t.Object({
  filter: t.Optional(t.Record(t.String(), t.Any())),
  sort: t.Optional(t.Record(t.String(), t.Union([t.Literal('asc'), t.Literal('desc')]))),
  limit: t.Optional(t.Number()),
  offset: t.Optional(t.Number()),
});
export const getTransactionsResponse = t.Array(transactionSchema);
