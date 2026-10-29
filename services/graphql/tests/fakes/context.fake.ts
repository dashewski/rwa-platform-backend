/**
 * GraphQL context factory for gateway resolver tests.
 *
 * Resolvers are plain functions that read { clients, services, user } off the
 * third argument, so tests call them directly with a fake context:
 *
 *   const fake = createFakeContext({ user: fakeUser });
 *   fake.clients.rwaClient.createPool.post.mockImplementationOnce(async () => edenOk(POOL));
 *   const result = await createPool(null, { input }, fake as unknown as GraphQLContext);
 *
 * Everything is in-memory: no network, no database, no broker, no ports.
 * Defaults: user/token are null (anonymous); pass { user: fakeUser } for
 * authenticated flows.
 */
import { mock } from 'bun:test';
import { fakeEdenClient, type FakeEdenClient } from './clients.fake';
import { createFakeServices, type FakeServices } from './services.fake';
import type { FileValidationConfig, User } from '../../src/graphql/context/types';

export const fakeUser: User = {
  id: 'user-1',
  wallet: '0x1111111111111111111111111111111111111111',
};

export interface FakeContext {
  clients: Record<string, FakeEdenClient>;
  services: FakeServices;
  user: User | null;
  token: string | null;
  pubSub: { publish: ReturnType<typeof mock>; subscribe: ReturnType<typeof mock> };
  traceContext: unknown;
  fileValidation: FileValidationConfig;
}

export const FAKE_FILE_VALIDATION: FileValidationConfig = {
  DOCUMENTS_ALLOWED_MIME_TYPES: ['application/pdf'],
  GALLERY_ALLOWED_MIME_TYPES: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
};

export function createFakeContext(overrides: Partial<FakeContext> = {}): FakeContext {
  const clients = new Proxy({} as Record<string, FakeEdenClient>, {
    get(target, prop: string) {
      if (!(prop in target)) {
        target[prop] = fakeEdenClient();
      }
      return target[prop];
    },
  });

  return {
    clients,
    services: createFakeServices(),
    user: null,
    token: null,
    pubSub: { publish: mock(async () => undefined), subscribe: mock(async () => undefined) },
    traceContext: {},
    fileValidation: FAKE_FILE_VALIDATION,
    ...overrides,
  };
}
