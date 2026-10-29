/**
 * Fake gateway inner services for resolver tests.
 *
 * Resolvers use ctx.services.* (ownership / parent / validation).
 * The real services have constructor-injected dependencies, so resolver tests
 * replace the whole service with a fake where every method is a bun:test mock()
 * resolving undefined by default. Override per test:
 *   fake.services.ownership.checkOwnership.mockImplementationOnce(async () => {
 *     throw new AppError({ message: '...', statusCode: 403, code: 'FORBIDDEN' });
 *   });
 */
import { mock } from 'bun:test';

export type FakeMethod = ReturnType<typeof mock>;
export type FakeService = Record<string, FakeMethod>;

export function fakeService(defaults: Record<string, () => Promise<unknown>> = {}): FakeService {
  const methods = new Map<string, FakeMethod>();
  return new Proxy({} as FakeService, {
    get(_target, prop: string) {
      if (!methods.has(prop)) {
        const impl = defaults[prop] ?? (async () => undefined);
        methods.set(prop, mock(impl));
      }
      return methods.get(prop);
    },
  });
}

export interface FakeServices {
  ownership: FakeService;
  parent: FakeService;
  validation: FakeService;
}

export const FAKE_OWNER_WALLET = '0x1111111111111111111111111111111111111111';

/** Fake ctx.services with pass-through defaults that most resolvers expect. */
export function createFakeServices(): FakeServices {
  return {
    ownership: fakeService({
      checkOwnership: async () => undefined,
      getOwnerWallet: async () => FAKE_OWNER_WALLET,
    }),
    parent: fakeService({
      getParentInfo: async () => ({ grandParentId: 'grand-1', ownerId: 'owner-1', ownerType: 'user' }),
    }),
    validation: fakeService({
      validateCountry: async () => undefined,
      validateSocials: async () => undefined,
    }),
  };
}
