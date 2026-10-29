/**
 * Unit tests for the gateway DAO query resolvers.
 *
 * Every DAO resolver is a thin pass-through to the dao service: it forwards
 * { filter, sort, limit, offset } and returns the upstream payload. The eden
 * client is an in-memory mock — no network, no database, no broker.
 *
 * Auth note: none of the DAO queries checks ctx.user, so they work for
 * anonymous callers as well.
 */
import { describe, expect, test } from 'bun:test';
import type { GraphQLResolveInfo } from 'graphql';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { createFakeContext } from '../fakes/context.fake';
import { edenError, edenOk } from '../fakes/clients.fake';
import { getProposals } from '../../src/graphql/modules/dao/resolvers/queries/getProposals';
import { getStaking } from '../../src/graphql/modules/dao/resolvers/queries/getStaking';
import { getStakingHistory } from '../../src/graphql/modules/dao/resolvers/queries/getStakingHistory';
import { getTimelockTasks } from '../../src/graphql/modules/dao/resolvers/queries/getTimelockTasks';
import { getTreasuryWithdraws } from '../../src/graphql/modules/dao/resolvers/queries/getTreasuryWithdraws';
import { getVotes } from '../../src/graphql/modules/dao/resolvers/queries/getVotes';

const INFO = {} as GraphQLResolveInfo;
const ROW = {
  id: 'row-1',
  chainId: '56',
  amount: '',
  createdAt: 0,
  isNative: false,
  logIndex: 0,
  recipient: '',
  token: '',
  transactionHash: '',
  updatedAt: 0,
  lastStakeTimestamp: 0,
  staker: '',
  unlockTimestamp: 0,
  operation: '',
  rewards: '',
  blockNumber: 0,
  governanceAddress: '',
  proposalId: '',
  reason: '',
  support: false,
  voterWallet: '',
  weight: '',
  cancelled: false,
  data: '',
  eta: 0,
  executed: false,
  target: '',
  txHash: '',
  creationTime: 0,
  description: '',
  endTime: 0,
  proposer: '',
  state: '',
};

const FILTER_INPUT = {
  filter: { chainId: '56' },
  sort: { createdAt: 'desc' },
  limit: 25,
  offset: 50,
};

describe('gateway dao resolvers (unit, fake eden clients)', () => {
  test('getProposals: forwards filter, sort and pagination and returns the data', async () => {
    const fake = createFakeContext();
    fake.clients.daoClient.getProposals.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getProposals!(
      null as never,
      { input: FILTER_INPUT } as never,
      fake as unknown as GraphQLContext,
    INFO);

    expect(fake.clients.daoClient.getProposals.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.daoClient.getProposals.post).toHaveBeenCalledWith(FILTER_INPUT);
    expect(result).toEqual([ROW]);
  });

  test('getProposals: defaults filter/sort to {} when input is omitted (no auth guard)', async () => {
    const fake = createFakeContext();
    fake.clients.daoClient.getProposals.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getProposals!(null as never, {} as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.daoClient.getProposals.post).toHaveBeenCalledWith({
      filter: {},
      sort: {},
      limit: undefined,
      offset: undefined,
    });
    expect(result).toEqual([ROW]);
  });

  test('getProposals: maps an upstream failure to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.daoClient.getProposals.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(getProposals!(null as never, {} as never, fake as unknown as GraphQLContext, INFO)).rejects.toMatchObject({
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  });

  test('getStaking: forwards filter, sort and pagination and returns the data', async () => {
    const fake = createFakeContext();
    fake.clients.daoClient.getStaking.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getStaking!(null as never, { input: FILTER_INPUT } as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.daoClient.getStaking.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.daoClient.getStaking.post).toHaveBeenCalledWith(FILTER_INPUT);
    expect(result).toEqual([ROW]);
  });

  test('getStaking: defaults filter/sort to {} when input is omitted (no auth guard)', async () => {
    const fake = createFakeContext();
    fake.clients.daoClient.getStaking.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getStaking!(null as never, {} as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.daoClient.getStaking.post).toHaveBeenCalledWith({
      filter: {},
      sort: {},
      limit: undefined,
      offset: undefined,
    });
    expect(result).toEqual([ROW]);
  });

  test('getStaking: maps an upstream failure to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.daoClient.getStaking.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(getStaking!(null as never, {} as never, fake as unknown as GraphQLContext, INFO)).rejects.toMatchObject({
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  });

  test('getStakingHistory: forwards filter, sort and pagination and returns the data', async () => {
    const fake = createFakeContext();
    fake.clients.daoClient.getStakingHistory.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getStakingHistory!(
      null as never,
      { input: FILTER_INPUT } as never,
      fake as unknown as GraphQLContext,
    INFO);

    expect(fake.clients.daoClient.getStakingHistory.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.daoClient.getStakingHistory.post).toHaveBeenCalledWith(FILTER_INPUT);
    expect(result).toEqual([ROW]);
  });

  test('getStakingHistory: defaults filter/sort to {} when input is omitted (no auth guard)', async () => {
    const fake = createFakeContext();
    fake.clients.daoClient.getStakingHistory.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getStakingHistory!(null as never, {} as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.daoClient.getStakingHistory.post).toHaveBeenCalledWith({
      filter: {},
      sort: {},
      limit: undefined,
      offset: undefined,
    });
    expect(result).toEqual([ROW]);
  });

  test('getStakingHistory: maps an upstream failure to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.daoClient.getStakingHistory.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      getStakingHistory!(null as never, {} as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  });

  test('getTimelockTasks: forwards filter, sort and pagination and returns the data', async () => {
    const fake = createFakeContext();
    fake.clients.daoClient.getTimelockTasks.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getTimelockTasks!(
      null as never,
      { input: FILTER_INPUT } as never,
      fake as unknown as GraphQLContext,
    INFO);

    expect(fake.clients.daoClient.getTimelockTasks.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.daoClient.getTimelockTasks.post).toHaveBeenCalledWith(FILTER_INPUT);
    expect(result).toEqual([ROW]);
  });

  test('getTimelockTasks: defaults filter/sort to {} when input is omitted (no auth guard)', async () => {
    const fake = createFakeContext();
    fake.clients.daoClient.getTimelockTasks.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getTimelockTasks!(null as never, {} as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.daoClient.getTimelockTasks.post).toHaveBeenCalledWith({
      filter: {},
      sort: {},
      limit: undefined,
      offset: undefined,
    });
    expect(result).toEqual([ROW]);
  });

  test('getTimelockTasks: maps an upstream failure to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.daoClient.getTimelockTasks.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(getTimelockTasks!(null as never, {} as never, fake as unknown as GraphQLContext, INFO)).rejects.toMatchObject(
      {
        statusCode: 502,
        code: 'BAD_GATEWAY',
      },
    );
  });

  test('getTreasuryWithdraws: forwards filter, sort and pagination and returns the data', async () => {
    const fake = createFakeContext();
    // The resolver calls the upstream operation named getTreasuryWithdrawals.
    fake.clients.daoClient.getTreasuryWithdrawals.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getTreasuryWithdraws!(
      null as never,
      { input: FILTER_INPUT } as never,
      fake as unknown as GraphQLContext,
    INFO);

    expect(fake.clients.daoClient.getTreasuryWithdrawals.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.daoClient.getTreasuryWithdrawals.post).toHaveBeenCalledWith(FILTER_INPUT);
    expect(result).toEqual([ROW]);
  });

  test('getTreasuryWithdraws: defaults filter/sort to {} when input is omitted (no auth guard)', async () => {
    const fake = createFakeContext();
    fake.clients.daoClient.getTreasuryWithdrawals.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getTreasuryWithdraws!(null as never, {} as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.daoClient.getTreasuryWithdrawals.post).toHaveBeenCalledWith({
      filter: {},
      sort: {},
      limit: undefined,
      offset: undefined,
    });
    expect(result).toEqual([ROW]);
  });

  test('getTreasuryWithdraws: maps an upstream failure to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.daoClient.getTreasuryWithdrawals.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      getTreasuryWithdraws!(null as never, {} as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  });

  test('getVotes: forwards filter, sort and pagination and returns the data', async () => {
    const fake = createFakeContext();
    fake.clients.daoClient.getVotes.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getVotes!(null as never, { input: FILTER_INPUT } as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.daoClient.getVotes.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.daoClient.getVotes.post).toHaveBeenCalledWith(FILTER_INPUT);
    expect(result).toEqual([ROW]);
  });

  test('getVotes: defaults filter/sort to {} when input is omitted (no auth guard)', async () => {
    const fake = createFakeContext();
    fake.clients.daoClient.getVotes.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getVotes!(null as never, {} as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.daoClient.getVotes.post).toHaveBeenCalledWith({
      filter: {},
      sort: {},
      limit: undefined,
      offset: undefined,
    });
    expect(result).toEqual([ROW]);
  });

  test('getVotes: maps an upstream failure to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.daoClient.getVotes.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(getVotes!(null as never, {} as never, fake as unknown as GraphQLContext, INFO)).rejects.toMatchObject({
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  });
});
