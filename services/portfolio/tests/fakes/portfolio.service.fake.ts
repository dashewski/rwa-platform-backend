/**
 * In-memory fake of PortfolioService for consumer-routing tests.
 *
 * The daemon only forwards blockchain events to the service (mapping the event
 * envelope onto the service payload), so its tests replace PortfolioService
 * with this fake to isolate the wiring: every method is wrapped in bun:test
 * mock() so interactions can be asserted.
 */
import { mock } from 'bun:test';

export function createFakePortfolioService() {
  return {
    processTransfer: mock(async (_data: unknown): Promise<void> => {}),
    getBalances: mock(async (_params: unknown): Promise<unknown> => ({})),
    getTransactions: mock(async (_params: unknown): Promise<unknown> => []),
  };
}

export type FakePortfolioService = ReturnType<typeof createFakePortfolioService>;
