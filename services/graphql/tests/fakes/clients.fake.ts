/**
 * Fake eden-treaty clients for gateway tests.
 *
 * Real clients are eden treaty instances: every operation is an object with
 * HTTP-verb methods (post/get/put/delete) returning a { data, error } envelope.
 * The error envelope mirrors eden: { status, value: { error: { code, message } } }.
 *
 * Usage in a resolver test:
 *   const fake = createFakeContext();
 *   fake.clients.rwaClient.getBusiness.post.mockImplementation(async () => edenOk(BUSINESS));
 *   await getBusiness(null, { id: 'b1' }, fake as unknown as GraphQLContext);
 */
import { mock } from 'bun:test';

export interface EdenOk<T = any> {
  data: T;
  error: null;
}

export interface EdenFail {
  data: null;
  error: { status: number; value: { error: { code: string; message: string } } };
}

export type EdenEnvelope<T = any> = EdenOk<T> | EdenFail;

export const edenOk = <T>(data: T): EdenOk<T> => ({ data, error: null });

export const edenError = (status = 500, code = 'INTERNAL_ERROR', message = 'upstream error'): EdenFail => ({
  data: null,
  error: { status, value: { error: { code, message } } },
});

export type FakeEdenOperation = {
  get: ReturnType<typeof mock>;
  post: ReturnType<typeof mock>;
  put: ReturnType<typeof mock>;
  delete: ReturnType<typeof mock>;
};

/** One eden operation (e.g. rwaClient.getBusiness) with mockable HTTP verbs. */
export function fakeOperation(initial: EdenEnvelope = edenOk(undefined)): FakeEdenOperation {
  return {
    get: mock(async () => initial),
    post: mock(async () => initial),
    put: mock(async () => initial),
    delete: mock(async () => initial),
  };
}

export type FakeEdenClient = Record<string, FakeEdenOperation>;

/**
 * Eden-treaty-shaped fake client. Unknown operations are created lazily and
 * cached, so ctx.clients.foo.bar.post is always the same mock instance.
 * Pass `overrides` (operation name -> envelope) to preset results.
 */
export function fakeEdenClient(overrides: Record<string, EdenEnvelope> = {}): FakeEdenClient {
  const operations = new Map<string, FakeEdenOperation>();
  return new Proxy({} as FakeEdenClient, {
    get(_target, prop: string) {
      if (!operations.has(prop)) {
        operations.set(prop, fakeOperation(overrides[prop]));
      }
      return operations.get(prop);
    },
  });
}
