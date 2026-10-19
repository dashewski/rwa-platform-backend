/**
 * Unit tests for the portfolio module resolvers.
 *
 * getBalances / getTransactions are plain resolver functions invoked with a
 * fake GraphQLContext built from tests/fakes/* (fake eden treaty client):
 * no network, no database, no broker. Both queries are anonymous, so the
 * default (user: null) context is what the resolvers see in production.
 */
import { describe, expect, test } from 'bun:test';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { createFakeContext } from '../fakes/context.fake';
import { edenError, edenOk } from '../fakes/clients.fake';
import { getBalances } from '../../src/graphql/modules/portfolio/resolvers/queries/getBalances';
import { getTransactions } from '../../src/graphql/modules/portfolio/resolvers/queries/getTransactions';

const BALANCE = {
  id: 'balance-1',
  owner: '0xwallet',
  tokenAddress: '0xtoken',
  tokenId: '1',
  poolAddress: '0xpool',
  chainId: '8453',
  balance: 1000,
  lastUpdateBlock: 19000000,
  createdAt: 1700000000,
  updatedAt: 1700000001,
};

const TRANSACTION = {
  id: 'tx-1',
  from: '0xwallet',
  to: '0xpool',
  tokenAddress: '0xtoken',
  tokenId: '1',
  poolAddress: '0xpool',
  chainId: '8453',
  transactionHash: '0xhash',
  blockNumber: 19000000,
  amount: 1000,
  createdAt: 1700000000,
  updatedAt: 1700000001,
};

const LIST_INPUT = {
  filter: { owner: '0xwallet' },
  sort: { field: 'createdAt', direction: 'desc' },
  limit: 25,
  offset: 50,
};

describe('portfolio resolvers (unit, fake clients)', () => {
  describe('Query.getBalances', () => {
    test('is readable anonymously, forwards filter/sort/pagination and returns the list', async () => {
      const fake = createFakeContext();
      fake.clients.portfolioClient.getBalances.post.mockImplementation(async () => edenOk([BALANCE]));

      const result = await getBalances(
        null as never,
        { input: LIST_INPUT } as never,
        fake as unknown as GraphQLContext,
      );

      expect(fake.clients.portfolioClient.getBalances.post).toHaveBeenCalledWith({
        filter: LIST_INPUT.filter,
        sort: LIST_INPUT.sort,
        limit: 25,
        offset: 50,
      });
      expect(result).toEqual([BALANCE]);
    });

    test('returns an empty array when nothing matches', async () => {
      const fake = createFakeContext();
      fake.clients.portfolioClient.getBalances.post.mockImplementation(async () => edenOk([]));

      const result = await getBalances(
        null as never,
        { input: LIST_INPUT } as never,
        fake as unknown as GraphQLContext,
      );

      expect(result).toEqual([]);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.portfolioClient.getBalances.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        getBalances(null as never, { input: LIST_INPUT } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('Query.getTransactions', () => {
    test('is readable anonymously, forwards filter/sort/pagination and returns the list', async () => {
      const fake = createFakeContext();
      fake.clients.portfolioClient.getTransactions.post.mockImplementation(async () => edenOk([TRANSACTION]));

      const result = await getTransactions(
        null as never,
        { input: LIST_INPUT } as never,
        fake as unknown as GraphQLContext,
      );

      expect(fake.clients.portfolioClient.getTransactions.post).toHaveBeenCalledWith({
        filter: LIST_INPUT.filter,
        sort: LIST_INPUT.sort,
        limit: 25,
        offset: 50,
      });
      expect(result).toEqual([TRANSACTION]);
    });

    test('returns an empty array when nothing matches', async () => {
      const fake = createFakeContext();
      fake.clients.portfolioClient.getTransactions.post.mockImplementation(async () => edenOk([]));

      const result = await getTransactions(
        null as never,
        { input: LIST_INPUT } as never,
        fake as unknown as GraphQLContext,
      );

      expect(result).toEqual([]);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.portfolioClient.getTransactions.post.mockImplementation(async () =>
        edenError(503, 'UNAVAILABLE', 'indexer down'),
      );

      await expect(
        getTransactions(null as never, { input: LIST_INPUT } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });
});
