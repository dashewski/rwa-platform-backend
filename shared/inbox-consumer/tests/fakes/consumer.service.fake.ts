/**
 * Stand-in for InboxConsumerService: it owns only the dedup marker, exactly like
 * the real service. `commit` writes the marker (and can fail with 11000, which
 * is how a duplicate delivery is recognised), `isCommitted` reads it.
 */
import { mock } from 'bun:test';
import type { InboxConsumerService } from '../../src/services/inboxConsumer.service';

export function createFakeConsumerService() {
  const state = {
    markers: new Set<string>(),
    commits: [] as string[],
    reads: [] as string[],
    commitError: null as unknown,
    /** Queue of outcomes for consecutive commit() calls: 'ok' | 'duplicate' | 'fail'. */
    commitOutcomes: [] as Array<'ok' | 'duplicate' | 'fail'>,
    readError: null as unknown,
    /** Marker ids that exist for isCommitted() regardless of commit() calls. */
    preexisting: new Set<string>(),
  };

  const service = {
    state,

    commit: mock(async (messageId: string): Promise<void> => {
      state.commits.push(messageId);
      const outcome = state.commitOutcomes.length
        ? (state.commitOutcomes.shift() as 'ok' | 'duplicate' | 'fail')
        : 'ok';

      if (state.commitError) throw state.commitError;
      if (outcome === 'fail') throw new Error('the inbox marker could not be written');

      if (outcome === 'duplicate' || state.markers.has(messageId)) {
        throw Object.assign(
          new Error('E11000 duplicate key error collection: inboxconsumermessages index: messageId_1'),
          { code: 11000 },
        );
      }

      state.markers.add(messageId);
    }),

    isCommitted: mock(async (messageId: string): Promise<boolean> => {
      state.reads.push(messageId);
      if (state.readError) throw state.readError;

      return state.markers.has(messageId) || state.preexisting.has(messageId);
    }),
  };

  return service;
}

export type FakeConsumerService = ReturnType<typeof createFakeConsumerService>;

export function asConsumerService(fake: FakeConsumerService): InboxConsumerService {
  return fake as unknown as InboxConsumerService;
}
