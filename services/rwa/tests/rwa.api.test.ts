/**
 * Component tests for the rwa HTTP layer.
 *
 * The whole Elysia app is assembled in-process: real services, real
 * controllers and the real ErrorHandlerPlugin, with repositories and clients
 * replaced by in-memory fakes. Requests go through app.handle() - no port is
 * bound, nothing is queried over the network. Run with `bun test` from
 * services/rwa.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createServicesPlugin } from '../src/plugins/services.plugin';
import { createControllersPlugin } from '../src/plugins/controllers.plugin';
import type { RepositoriesPlugin } from '../src/plugins/repositories.plugin';
import type { ClientsPlugin } from '../src/plugins/clients.plugin';
import { createFakeBusinessRepository, type FakeBusinessRepository } from './fakes/business.repository.fake';
import { createFakePoolRepository, type FakePoolRepository } from './fakes/pool.repository.fake';
import { createFakeOpenRouterClient } from './fakes/open-router.client.fake';
import { createFakeSignersManagerClient, DEFAULT_SIGNATURE_TASK_ID } from './fakes/signers-manager.client.fake';
import { createFakeRabbitMQClient } from './fakes/rabbitmq.client.fake';
import { createFakeInboxConsumerMessageRepository } from './fakes/inbox-outbox.repositories.fake';
import { createFakeAiEvaluatorClient } from './fakes/ai-evaluator.client.fake';
import { createFakePoolEventsClient } from './fakes/pool-events.client.fake';
import { createFakeRedisEventsClient } from './fakes/redis-events.client.fake';

const OWNER_ID = 'owner-1';
const OWNER_TYPE = 'business';
const CHAIN_ID = '97';
const FACTORY_ADDRESS = '0xF46A71cac8B1A8F734559Cc4367CD1546A1A29bF';
const OWNER_WALLET = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
const DEPLOYER_WALLET = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';
const CREATE_RWA_FEE = '1000000000000000';
const OPEN_ROUTER_MODEL = 'test/model';
const PLACEHOLDER_IMAGE_URL = 'https://test.domain/placeholder.png';
const FILES_BASE_URL = 'https://test.domain/files';
const SUPPORTED_NETWORKS = [{ chainId: CHAIN_ID, name: 'BSC Testnet', factoryAddress: FACTORY_ADDRESS }];

const RWA_ADDRESS = '0x00000000000000000000000000000000000000bb';

const BUSINESS = {
  name: 'Alpha Ventures',
  ownerId: OWNER_ID,
  ownerType: OWNER_TYPE,
  chainId: CHAIN_ID,
};

const POOL = {
  ownerId: OWNER_ID,
  ownerType: OWNER_TYPE,
  name: 'Alpha Pool',
  chainId: CHAIN_ID,
  rwaAddress: RWA_ADDRESS,
};

// Mirrors the decorators the real Clients plugin exposes, wired to fakes.
function createFakeClients() {
  const redisEventsClient = createFakeRedisEventsClient();

  return {
    aiEvaluatorClient: createFakeAiEvaluatorClient(),
    signersManagerClient: createFakeSignersManagerClient(),
    redisEventsClient,
    poolEventsClient: createFakePoolEventsClient(redisEventsClient),
    openRouterClient: createFakeOpenRouterClient(),
    rabbitMQClient: createFakeRabbitMQClient(),
  };
}

type FakeClients = ReturnType<typeof createFakeClients>;

function buildApp(businesses: FakeBusinessRepository, pools: FakePoolRepository, clients: FakeClients) {
  const repositoriesPlugin = new Elysia({ name: 'Repositories' })
    .decorate('businessRepository', businesses)
    .decorate('poolRepository', pools)
    .decorate('inboxConsumerMessageRepository', createFakeInboxConsumerMessageRepository());

  const clientsPlugin = new Elysia({ name: 'Clients' })
    .decorate('aiEvaluatorClient', clients.aiEvaluatorClient)
    .decorate('signersManagerClient', clients.signersManagerClient)
    .decorate('redisEventsClient', clients.redisEventsClient)
    .decorate('poolEventsClient', clients.poolEventsClient)
    .decorate('openRouterClient', clients.openRouterClient)
    .decorate('rabbitMQClient', clients.rabbitMQClient);

  const servicesPlugin = createServicesPlugin(
    repositoriesPlugin as unknown as RepositoriesPlugin,
    clientsPlugin as unknown as ClientsPlugin,
    SUPPORTED_NETWORKS,
    OPEN_ROUTER_MODEL,
    PLACEHOLDER_IMAGE_URL,
    FILES_BASE_URL,
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

describe('rwa HTTP layer (component, fake repositories and clients)', () => {
  let businesses: FakeBusinessRepository;
  let pools: FakePoolRepository;
  let clients: FakeClients;
  let app: App;

  beforeEach(() => {
    businesses = createFakeBusinessRepository();
    pools = createFakePoolRepository();
    clients = createFakeClients();
    app = buildApp(businesses, pools, clients);
  });

  test('createBusiness -> getBusiness -> getBusinesses round-trip', async () => {
    const created = await post(app, '/createBusiness', BUSINESS);
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      name: BUSINESS.name,
      ownerId: OWNER_ID,
      ownerType: OWNER_TYPE,
      chainId: CHAIN_ID,
    });
    expect(typeof created.body.id).toBe('string');

    const fetched = await post(app, '/getBusiness', { id: created.body.id });
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(created.body);

    const list = await post(app, '/getBusinesses', { filter: {} });
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
  });

  test('createBusiness: an invalid payload never reaches the repository', async () => {
    const response = await post(app, '/createBusiness', { name: 'Missing everything else' });

    expect(response.status).not.toBe(200);
    expect(businesses.createBusiness).toHaveBeenCalledTimes(0);
  });

  test('createBusiness: an unsupported chainId maps to 403 NOT_ALLOWED', async () => {
    const response = await post(app, '/createBusiness', { ...BUSINESS, chainId: '1' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'NOT_ALLOWED', message: 'Chain ID 1 is not supported' },
    });
    expect(businesses.createBusiness).toHaveBeenCalledTimes(0);
  });

  test('editBusiness: rename is visible through getBusiness', async () => {
    const created = await post(app, '/createBusiness', BUSINESS);

    const updated = await post(app, '/editBusiness', { id: created.body.id, updateData: { name: 'Renamed' } });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('Renamed');

    const fetched = await post(app, '/getBusiness', { id: created.body.id });
    expect(fetched.body.name).toBe('Renamed');
  });

  test('requestBusinessEvaluation: asks the evaluator and flags the evaluation after the reply', async () => {
    const created = await post(app, '/createBusiness', BUSINESS);

    const response = await post(app, '/requestBusinessEvaluation', { id: created.body.id });

    expect(response.status).toBe(200);
    expect(response.body.riskScoreEvaluationProcess).toBe(true);
    expect(clients.aiEvaluatorClient.createBusinessEvaluation.post).toHaveBeenCalledWith({
      businessId: created.body.id,
      ownerId: OWNER_ID,
      ownerType: OWNER_TYPE,
    });
  });

  test('requestBusinessApprovalSignatures: returns the task id, a second call is rejected', async () => {
    const created = await post(app, '/createBusiness', BUSINESS);
    const payload = {
      id: created.body.id,
      ownerWallet: OWNER_WALLET,
      deployerWallet: DEPLOYER_WALLET,
      createRWAFee: CREATE_RWA_FEE,
    };

    const first = await post(app, '/requestBusinessApprovalSignatures', payload);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ taskId: DEFAULT_SIGNATURE_TASK_ID });

    const second = await post(app, '/requestBusinessApprovalSignatures', payload);
    expect(second.status).toBe(403);
    expect(second.body).toEqual({
      error: { code: 'NOT_ALLOWED', message: 'Business already has an active approval signatures task' },
    });
  });

  test('getBusiness: an unknown id maps to 404 NOT_FOUND', async () => {
    const response = await post(app, '/getBusiness', { id: 'unknown-id' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Business unknown-id not found' } });
  });

  test('createPool -> getPool -> getPools round-trip', async () => {
    const business = (await post(app, '/createBusiness', BUSINESS)).body;

    const created = await post(app, '/createPool', { ...POOL, businessId: business.id });
    expect(created.status).toBe(200);
    expect(created.body.businessId).toBe(business.id);
    expect(created.body.rwaAddress).toBe(RWA_ADDRESS);
    expect(created.body.outgoingTranches).toEqual([]);
    expect(created.body.incomingTranches).toEqual([]);

    const fetched = await post(app, '/getPool', { id: created.body.id });
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(created.body);

    const list = await post(app, '/getPools', { filter: {} });
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
  });

  test('getPools: filter is forwarded end-to-end', async () => {
    await post(app, '/createPool', { ...POOL, businessId: 'business-1' });
    await post(app, '/createPool', { ...POOL, name: 'Other', businessId: 'business-2' });

    const list = await post(app, '/getPools', { filter: { businessId: 'business-2' } });

    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe('Other');
  });

  test('createPool: a missing rwaAddress never reaches the repository', async () => {
    const response = await post(app, '/createPool', {
      ownerId: OWNER_ID,
      ownerType: OWNER_TYPE,
      name: POOL.name,
      chainId: CHAIN_ID,
      businessId: 'business-1',
    });

    expect(response.status).not.toBe(200);
    expect(pools.createPool).toHaveBeenCalledTimes(0);
  });

  test('getTokenMetadata: returns ERC-1155 metadata for a known pool token', async () => {
    const business = (await post(app, '/createBusiness', { ...BUSINESS, description: 'Business description' })).body;
    const pool = (await post(app, '/createPool', { ...POOL, businessId: business.id, description: 'Pool description' }))
      .body;
    // tokenId is set on deployment, outside the create request - seed it on the fake repository.
    await pools.updatePool(pool.id, { tokenId: '42' });

    const response = await post(app, '/getTokenMetadata', { rwaAddress: RWA_ADDRESS, tokenId: '42' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe(POOL.name);
    expect(response.body.description).toBe('Business description\n\nPool description');
    expect(response.body.image).toBe(PLACEHOLDER_IMAGE_URL); // no image on either entity
    expect(response.body.decimals).toBe(18);
    expect(response.body.properties.business.id).toBe(business.id);
    expect(response.body.properties.business.name).toBe(BUSINESS.name);
    expect(response.body.properties.pool.address).toBeUndefined();
    expect(response.body.properties.status).toEqual({
      isTargetReached: false,
      isFullyReturned: false,
      paused: false,
    });
    expect(response.body.properties.tags).toEqual([]);
  });

  test('getTokenMetadata: an unknown token maps to 404 NOT_FOUND', async () => {
    const response = await post(app, '/getTokenMetadata', { rwaAddress: RWA_ADDRESS, tokenId: '9' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: `Pool with rwaAddress ${RWA_ADDRESS} and tokenId 9 not found`,
      },
    });
  });
});
