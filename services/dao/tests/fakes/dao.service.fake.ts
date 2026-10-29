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
    processProposalCreated: mock(async (_event: unknown, commitInbox: () => Promise<void>): Promise<void> => {
      await commitInbox();
    }),
    processProposalExecuted: mock(async (_event: unknown, commitInbox: () => Promise<void>): Promise<void> => {
      await commitInbox();
    }),
    processProposalCancelled: mock(async (_event: unknown, commitInbox: () => Promise<void>): Promise<void> => {
      await commitInbox();
    }),
    processVoteCast: mock(async (_event: unknown, commitInbox: () => Promise<void>): Promise<void> => {
      await commitInbox();
    }),
    processTokensStaked: mock(async (_event: unknown, commitInbox: () => Promise<void>): Promise<void> => {
      await commitInbox();
    }),
    processTokensUnstaked: mock(async (_event: unknown, commitInbox: () => Promise<void>): Promise<void> => {
      await commitInbox();
    }),
    processTokensLocked: mock(async (_event: unknown, commitInbox: () => Promise<void>): Promise<void> => {
      await commitInbox();
    }),
    processTransactionQueued: mock(async (_event: unknown, commitInbox: () => Promise<void>): Promise<void> => {
      await commitInbox();
    }),
    processTransactionExecuted: mock(async (_event: unknown, commitInbox: () => Promise<void>): Promise<void> => {
      await commitInbox();
    }),
    processTransactionCancelled: mock(async (_event: unknown, commitInbox: () => Promise<void>): Promise<void> => {
      await commitInbox();
    }),
    processTreasuryWithdrawal: mock(async (_event: unknown, commitInbox: () => Promise<void>): Promise<void> => {
      await commitInbox();
    }),
  };
}

export type FakeDaoService = ReturnType<typeof createFakeDaoService>;
