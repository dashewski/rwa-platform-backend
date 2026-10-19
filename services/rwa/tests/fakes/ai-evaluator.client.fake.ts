/**
 * In-memory fake of the rwa-side AiEvaluatorClient.
 *
 * Mirrors the Eden-like surface the services use:
 * `client.createPoolEvaluation.post(body)` / `client.createBusinessEvaluation.post(body)`,
 * both returning `{ data, error, status }`.
 */
import { mock } from 'bun:test';

export type EvaluatorResponse<T> = { data: T | null; error: string | null; status: number };

export function createFakeAiEvaluatorClient() {
  const state = {
    poolCalls: [] as Array<{ poolId: string; ownerId: string; ownerType: string }>,
    businessCalls: [] as Array<{ businessId: string; ownerId: string; ownerType: string }>,
    nextStatus: 200,
    nextError: null as string | null,
    nextData: null as unknown,
  };

  const respond = <T>(fallback: T): EvaluatorResponse<T> => {
    if (state.nextError !== null || state.nextStatus >= 400) {
      return { data: null, error: state.nextError ?? 'unavailable', status: state.nextStatus };
    }

    return { data: (state.nextData ?? fallback) as T, error: null, status: state.nextStatus };
  };

  const client = {
    state,

    createPoolEvaluation: {
      post: mock(async (body: { poolId: string; ownerId: string; ownerType: string }) => {
        if (state.nextError === null && state.nextStatus < 400) state.poolCalls.push(body);
        return respond({ jobId: `pool-job-${state.poolCalls.length}` });
      }),
    },

    createBusinessEvaluation: {
      post: mock(async (body: { businessId: string; ownerId: string; ownerType: string }) => {
        if (state.nextError === null && state.nextStatus < 400) state.businessCalls.push(body);
        return respond({ jobId: `business-job-${state.businessCalls.length}` });
      }),
    },
  };

  return client;
}

export type FakeAiEvaluatorClient = ReturnType<typeof createFakeAiEvaluatorClient>;
