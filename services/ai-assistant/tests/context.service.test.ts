/**
 * Unit tests for ContextService.
 *
 * Scope: the service layer only. The injected eden treaty clients (RWA and
 * portfolio) are replaced with in-memory fakes (tests/fakes/eden.clients.fake.ts)
 * that keep the { data, error } envelope shape of treaty responses, so no HTTP
 * request is made. Run with `bun test` from services/ai-assistant.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { ContextService } from '../src/services/context.service';
import type { RwaClient, PortfolioClient } from '../src/clients/eden.clients';
import {
  createFakePortfolioClient,
  createFakeRwaClient,
  type FakePool,
  type FakePortfolioClient,
  type FakeRwaClient,
} from './fakes/eden.clients.fake';

const POOL: FakePool = {
  id: '0xpool-1',
  name: 'Solar Farm One',
  poolAddress: '0xpool-1',
  awaitingRwaAmount: '500',
  expectedRwaAmount: '1000',
};

describe('ContextService (unit, fake eden clients)', () => {
  let rwa: FakeRwaClient;
  let portfolio: FakePortfolioClient;
  let service: ContextService;

  beforeEach(() => {
    rwa = createFakeRwaClient();
    portfolio = createFakePortfolioClient();
    service = new ContextService(rwa as unknown as RwaClient, portfolio as unknown as PortfolioClient);
  });

  test('returns an empty string when no preferences are selected and never calls the clients', async () => {
    const context = await service.getContextForAssistant([], 'user-1');

    expect(context).toBe('');
    expect(rwa.getPools.post).toHaveBeenCalledTimes(0);
    expect(portfolio.getBalances.post).toHaveBeenCalledTimes(0);
  });

  test('investor_base: returns the investor base prompt without calling the clients', async () => {
    const context = await service.getContextForAssistant(['investor_base'], 'user-1');

    expect(context).toContain('helping investors understand and navigate RWA investment opportunities');
    expect(rwa.getPools.post).toHaveBeenCalledTimes(0);
    expect(portfolio.getBalances.post).toHaveBeenCalledTimes(0);
  });

  test('product_owner_base: returns the product owner base prompt', async () => {
    const context = await service.getContextForAssistant(['product_owner_base'], 'user-1');

    expect(context).toContain('helping product owners tokenize their real-world assets');
    expect(rwa.getPools.post).toHaveBeenCalledTimes(0);
  });

  test('joins multiple context parts with a blank line, base prompts before dynamic data', async () => {
    rwa.state.pools.push(POOL);

    const context = await service.getContextForAssistant(['popular_pools', 'investor_base'], 'user-1');

    expect(context).toContain('helping investors understand and navigate RWA investment opportunities');
    expect(context).toContain('Investment Pools System Description:');
    expect(context).toContain('Currently popular investment pools:');
    // Order is defined by the src logic: base prompts first, then dynamic data.
    expect(context.indexOf('helping investors')).toBeLessThan(context.indexOf('Investment Pools System Description:'));
  });

  test('popular_pools: forwards the pool query and formats funded progress', async () => {
    rwa.state.pools.push(
      { ...POOL, awaitingRwaAmount: '250', expectedRwaAmount: '1000' },
      {
        ...POOL,
        id: '0xpool-2',
        poolAddress: '0xpool-2',
        name: 'Wind Farm',
        awaitingRwaAmount: '1',
        expectedRwaAmount: '3',
      },
    );

    const context = await service.getContextForAssistant(['popular_pools'], 'user-1');

    expect(context).toContain(
      'Currently popular investment pools:\n' +
        '- Solar Farm One (0xpool-1): 25.0% funded (250/1000 tokens)\n' +
        '- Wind Farm (0xpool-2): 33.3% funded (1/3 tokens)',
    );

    const body = rwa.getPools.post.mock.calls[0][0];
    expect(body.limit).toBe(100);
    expect(body.filter?.poolAddress).toEqual({ $ne: null });
    expect(body.filter?.targetReached).toBe(false);
    expect(body.filter?.entryPeriodStart).toEqual({ $lte: expect.any(Number) });
    expect(body.filter?.entryPeriodExpired).toEqual({ $gt: expect.any(Number) });
    // Pinned current behavior: awaitingRwaAmount is compared against the literal
    // string 'expectedRwaAmount/2' — a plain Mongo filter, not an aggregation
    // expression — so it only matches documents whose value is that exact string.
    expect(body.filter?.awaitingRwaAmount).toEqual({ $gt: 'expectedRwaAmount/2' });
  });

  test('popular_pools: an eden error envelope drops the dynamic part', async () => {
    rwa.state.errorResponse = { status: 500, value: { message: 'boom' } };

    const context = await service.getContextForAssistant(['investor_base', 'popular_pools'], 'user-1');

    expect(context).toContain('helping investors');
    expect(context).not.toContain('Investment Pools System Description:');
  });

  test('popular_pools: an empty pool list drops the dynamic part', async () => {
    const context = await service.getContextForAssistant(['popular_pools'], 'user-1');

    expect(context).toBe('');
  });

  test('popular_pools: a client failure is swallowed and drops the dynamic part', async () => {
    rwa.state.throwError = new Error('ECONNREFUSED');

    const context = await service.getContextForAssistant(['popular_pools'], 'user-1');

    expect(context).toBe('');
  });

  test('user_portfolio: forwards the owner filter, resolves pools and maps pool names', async () => {
    portfolio.state.balances.push({ owner: 'user-1', poolAddress: '0xpool-1', balance: 10 });
    rwa.state.pools.push(POOL);

    const context = await service.getContextForAssistant(['user_portfolio'], 'user-1');

    expect(portfolio.getBalances.post).toHaveBeenCalledWith({ filter: { owner: 'user-1', balance: { $gt: 0 } } });
    expect(rwa.getPools.post).toHaveBeenCalledWith({ filter: { id: { $in: ['0xpool-1'] } } });
    expect(context).toContain('Portfolio System Description:');
    expect(context).toContain('Your current investments:');
    // Pinned current behavior: the src looks the pool up by `pool.id === balance.poolAddress`.
    expect(context).toContain('- Solar Farm One: 10 tokens');
  });

  test('user_portfolio: falls back to "Unknown Pool" when no pool id matches the balance pool address', async () => {
    portfolio.state.balances.push({ owner: 'user-1', poolAddress: '0xpool-1', balance: 10 });
    // Pinned current behavior: the lookup compares the pool document `id` with the
    // balance `poolAddress` (getPopularPoolsContext formats pool.poolAddress instead),
    // so a document id never matches the contract address and the fallback line is used.
    rwa.state.pools.push({ ...POOL, id: 'pool-doc-1' });

    const context = await service.getContextForAssistant(['user_portfolio'], 'user-1');

    expect(context).toContain('- Unknown Pool: 10 tokens');
  });

  test('user_portfolio: returns nothing when there are no balances', async () => {
    const context = await service.getContextForAssistant(['user_portfolio'], 'user-1');

    expect(context).toBe('');
    expect(rwa.getPools.post).toHaveBeenCalledTimes(0);
  });

  test('user_portfolio: an eden error envelope on the balances drops the dynamic part', async () => {
    portfolio.state.balances.push({ owner: 'user-1', poolAddress: '0xpool-1', balance: 10 });
    portfolio.state.errorResponse = { status: 500, value: { message: 'boom' } };

    const context = await service.getContextForAssistant(['user_portfolio'], 'user-1');

    expect(context).toBe('');
    expect(rwa.getPools.post).toHaveBeenCalledTimes(0);
  });

  test('user_portfolio: an eden error envelope on the pool lookup drops the dynamic part', async () => {
    portfolio.state.balances.push({ owner: 'user-1', poolAddress: '0xpool-1', balance: 10 });
    rwa.state.errorResponse = { status: 500, value: { message: 'boom' } };

    const context = await service.getContextForAssistant(['user_portfolio'], 'user-1');

    expect(context).toBe('');
  });

  test('user_portfolio: an empty pool lookup drops the dynamic part', async () => {
    portfolio.state.balances.push({ owner: 'user-1', poolAddress: '0xpool-1', balance: 10 });

    const context = await service.getContextForAssistant(['user_portfolio'], 'user-1');

    expect(context).toBe('');
  });

  test('user_portfolio: a client failure is swallowed and drops the dynamic part', async () => {
    portfolio.state.throwError = new Error('ECONNREFUSED');

    const context = await service.getContextForAssistant(['user_portfolio'], 'user-1');

    expect(context).toBe('');
  });
});
