/**
 * Component tests for the blockchain-scanner HTTP layer.
 *
 * The whole Elysia app is assembled in-process: real controllers and the real
 * BlockchainScannerService, with repositories and the ordered publisher replaced
 * by in-memory fakes. Requests go through app.handle() — no port is bound and
 * nothing is queried over the network (createApp() is not used because it
 * connects mongoose). Run with `bun test` from services/blockchain-scanner.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { Types } from 'mongoose';
import { Elysia } from 'elysia';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createServicesPlugin } from '../src/plugins/services.plugin';
import { createControllersPlugin } from '../src/plugins/controllers.plugin';
import type { RepositoriesPlugin } from '../src/plugins/repositories.plugin';
import type { OrderedPublisherPlugin } from '@shared/ordered-publisher';
import { createFakeEventRepository, type FakeEventDoc, type FakeEventRepository } from './fakes/event.repository.fake';
import {
  createFakeScannerStateRepository,
  type FakeScannerStateRepository,
} from './fakes/scannerState.repository.fake';
import {
  createFakeOrderedPublisher,
  type FakeOrderedPublisher,
} from './fakes/orderedPublisher.fake';

const CHAIN_ID = 31337;
const CONTRACT_ADDRESS = '0x00000000000000000000000000000000000000aa';

function seedEvent(
  events: FakeEventRepository,
  input: { name: string; blockNumber: number; logIndex: number; data: Record<string, any> },
): FakeEventDoc {
  const doc: FakeEventDoc = {
    _id: new Types.ObjectId(),
    chainId: CHAIN_ID,
    blockNumber: input.blockNumber,
    transactionHash: `0x${(input.blockNumber * 10 + input.logIndex).toString(16).padStart(64, '0')}`,
    logIndex: input.logIndex,
    address: CONTRACT_ADDRESS,
    name: input.name,
    data: input.data,
    timestamp: 1700000000 + input.blockNumber,
    createdAt: 1700000000,
    updatedAt: 1700000000,
  };
  events.store.set(doc._id.toString(), doc);
  return doc;
}

function buildApp(
  events: FakeEventRepository,
  scannerState: FakeScannerStateRepository,
  publisher: FakeOrderedPublisher,
) {
  const repositoriesPlugin = new Elysia({ name: 'Repositories' })
    .decorate('eventRepository', events)
    .decorate('scannerStateRepository', scannerState);

  const orderedPublisherPlugin = new Elysia({ name: 'OrderedPublisher' }).decorate('orderedPublisher', publisher);

  const servicesPlugin = createServicesPlugin(
    repositoriesPlugin as unknown as RepositoriesPlugin,
    orderedPublisherPlugin as unknown as OrderedPublisherPlugin,
    CHAIN_ID,
  );

  return new Elysia().onError(ErrorHandlerPlugin).use(createControllersPlugin(servicesPlugin));
}

type App = ReturnType<typeof buildApp>;

async function post(app: App, path: string, body: unknown) {
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

  return { status: response.status, body: (await response.json()) as any };
}

describe('blockchain-scanner HTTP layer (component, fake repositories + fake publisher)', () => {
  let events: FakeEventRepository;
  let scannerState: FakeScannerStateRepository;
  let publisher: FakeOrderedPublisher;
  let app: App;

  beforeEach(() => {
    events = createFakeEventRepository();
    scannerState = createFakeScannerStateRepository();
    publisher = createFakeOrderedPublisher();
    app = buildApp(events, scannerState, publisher);
  });

  test('getEventById: returns the mapped event without Mongo internals', async () => {
    const seeded = seedEvent(events, {
      name: 'RWA_Deployed',
      blockNumber: 1000,
      logIndex: 0,
      data: { emittedFrom: CONTRACT_ADDRESS, deployer: '0x00000000000000000000000000000000000000bb', entityId: 'business-1' },
    });

    const response = await post(app, '/getEventById', { id: seeded._id.toString() });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: seeded._id.toString(),
      chainId: CHAIN_ID,
      blockNumber: 1000,
      transactionHash: seeded.transactionHash,
      logIndex: 0,
      address: CONTRACT_ADDRESS,
      name: 'RWA_Deployed',
      data: seeded.data,
      timestamp: 1700001000,
    });
    expect(response.body).not.toHaveProperty('_id');
  });

  test('getEventById: an unknown id maps to 404 NOT_FOUND', async () => {
    const response = await post(app, '/getEventById', { id: 'unknown-id' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Event with id unknown-id not found' },
    });
  });

  test('getEvents: a name filter is forwarded end-to-end and results are newest-first', async () => {
    seedEvent(events, { name: 'RWA_Deployed', blockNumber: 1000, logIndex: 0, data: { entityId: 'business-1' } });
    seedEvent(events, { name: 'RWA_Deployed', blockNumber: 1001, logIndex: 0, data: { entityId: 'business-2' } });
    seedEvent(events, {
      name: 'Pool_ReservesUpdated',
      blockNumber: 1002,
      logIndex: 0,
      data: { realHoldReserve: '1', virtualHoldReserve: '2', virtualRwaReserve: '3' },
    });

    const response = await post(app, '/getEvents', { name: 'RWA_Deployed' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body.map((event: any) => event.blockNumber)).toEqual([1001, 1000]);
    expect(response.body.map((event: any) => event.data.entityId)).toEqual(['business-2', 'business-1']);

    expect(events.findAll).toHaveBeenCalledTimes(1);
    const [filters, sort, limit, offset] = events.findAll.mock.calls[0];
    // Elysia may keep untouched optional fields as undefined; the filter value itself must arrive as sent.
    expect(filters).toMatchObject({ name: 'RWA_Deployed' });
    expect(filters).not.toHaveProperty('pagination');
    expect(sort).toEqual({ blockNumber: -1, logIndex: -1 });
    expect(limit).toBe(100);
    expect(offset).toBe(0);
  });

  test('getEvents: a numeric blockNumber filter is forwarded', async () => {
    seedEvent(events, { name: 'RWA_Deployed', blockNumber: 1000, logIndex: 0, data: { entityId: 'business-1' } });
    seedEvent(events, { name: 'RWA_Deployed', blockNumber: 1001, logIndex: 0, data: { entityId: 'business-2' } });

    const response = await post(app, '/getEvents', { blockNumber: 1001 });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].blockNumber).toBe(1001);
    expect(response.body[0].data.entityId).toBe('business-2');

    const [filters] = events.findAll.mock.calls[0];
    expect(filters).toMatchObject({ blockNumber: 1001 });
  });

  test('getEvents: pagination is forwarded as limit/offset and never leaks into the filter', async () => {
    seedEvent(events, { name: 'RWA_Deployed', blockNumber: 1000, logIndex: 0, data: { entityId: 'business-1' } });
    seedEvent(events, { name: 'RWA_Deployed', blockNumber: 1001, logIndex: 0, data: { entityId: 'business-2' } });
    seedEvent(events, { name: 'RWA_Deployed', blockNumber: 1002, logIndex: 0, data: { entityId: 'business-3' } });

    const response = await post(app, '/getEvents', { pagination: { limit: 1, offset: 1 } });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    // newest-first order is [1002, 1001, 1000]; offset 1 limit 1 selects 1001.
    expect(response.body[0].blockNumber).toBe(1001);

    const [filters, sort, limit, offset] = events.findAll.mock.calls[0];
    expect(filters).not.toHaveProperty('pagination');
    expect(sort).toEqual({ blockNumber: -1, logIndex: -1 });
    expect(limit).toBe(1);
    expect(offset).toBe(1);
  });

  test('getEvents: pagination.sort is accepted by the schema but ignored by the service', async () => {
    seedEvent(events, { name: 'RWA_Deployed', blockNumber: 1000, logIndex: 0, data: { entityId: 'business-1' } });

    const response = await post(app, '/getEvents', { pagination: { limit: 10, sort: { blockNumber: 'asc' } } });

    expect(response.status).toBe(200);
    // The response schema advertises sort, but the query uses the hardcoded
    // { blockNumber: -1, logIndex: -1 } order.
    const [, sort] = events.findAll.mock.calls[0];
    expect(sort).toEqual({ blockNumber: -1, logIndex: -1 });
  });

  test('getEvents: an invalid payload never reaches the repository', async () => {
    const response = await post(app, '/getEvents', { chainId: 'not-a-number' });

    expect(response.status).not.toBe(200);
    expect(events.findAll).toHaveBeenCalledTimes(0);
  });
});
