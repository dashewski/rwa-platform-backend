/**
 * In-memory fake of DaoService for blockchain-events tests.
 *
 * The consumer only forwards blockchain events to the service, so its tests
 * replace DaoService with this fake to isolate routing: every process* method
 * is wrapped in bun:test mock() so interactions can be asserted.
 */
import { mock } from 'bun:test';

export function createFakeDaoService() {
  return {
    processProposalCreated: mock(async (_event: unknown): Promise<void> => {}),
    processProposalExecuted: mock(async (_event: unknown): Promise<void> => {}),
    processProposalCancelled: mock(async (_event: unknown): Promise<void> => {}),
    processVoteCast: mock(async (_event: unknown): Promise<void> => {}),
    processTokensStaked: mock(async (_event: unknown): Promise<void> => {}),
    processTokensUnstaked: mock(async (_event: unknown): Promise<void> => {}),
    processTokensLocked: mock(async (_event: unknown): Promise<void> => {}),
    processTransactionQueued: mock(async (_event: unknown): Promise<void> => {}),
    processTransactionExecuted: mock(async (_event: unknown): Promise<void> => {}),
    processTransactionCancelled: mock(async (_event: unknown): Promise<void> => {}),
    processTreasuryWithdrawal: mock(async (_event: unknown): Promise<void> => {}),
  };
}

export type FakeDaoService = ReturnType<typeof createFakeDaoService>;
