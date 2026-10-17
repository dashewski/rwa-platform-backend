/**
 * Component tests for the loyalty HTTP layer.
 *
 * The whole Elysia app is assembled in-process: the real controllers, the real
 * LoyaltyService and the real services/controllers plugins, with repositories
 * and the signers-manager client replaced by in-memory fakes. The repositories
 * and clients plugins are stand-ins that expose exactly the decorator names
 * src/plugins read. Requests go through app.handle() — no port is bound, no
 * broker and no database is involved. Run with `bun test` from services/loyalty.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createServicesPlugin } from '../src/plugins/services.plugin';
import { createControllersPlugin } from '../src/plugins/controllers.plugin';
import type { RepositoriesPlugin } from '../src/plugins/repositories.plugin';
import type { ClientsPlugin } from '../src/plugins/clients.plugin';
import { createFakeFeesRepository, type FakeFeesRepository } from './fakes/fees.repository.fake';
import { createFakeReferralRepository, type FakeReferralRepository } from './fakes/referral.repository.fake';
import {
  createFakeReferrerWithdrawRepository,
  type FakeReferrerWithdrawRepository,
} from './fakes/referrerWithdraw.repository.fake';
import {
  createFakeReferrerClaimHistoryRepository,
  type FakeReferrerClaimHistoryRepository,
} from './fakes/referrerClaimHistory.repository.fake';
import {
  createFakeCommissionHistoryRepository,
  type FakeCommissionHistoryRepository,
} from './fakes/commissionHistory.repository.fake';
import {
  createFakeSignersManagerClient,
  FAKE_SIGNERS_TASK_ID,
  type FakeSignersManagerClient,
} from './fakes/signersManager.client.fake';

const CHAIN_ID = '97';
const UNSUPPORTED_CHAIN_ID = '56';
const REFERRAL_TREASURY_ADDRESS = '0xcf56E77069cC2aBfA6c1Df9bfD4155F782697B9D';
const USER_WALLET = '0x1111111111111111111111111111111111111111';
const REFERRER_WALLET = '0x2222222222222222222222222222222222222222';
const TOKEN_ADDRESS = '0x3333333333333333333333333333333333333333';
const TRANSACTION_HASH = '0x' + 'ab'.repeat(32);
const REFERRAL_REWARD_PERCENTAGE = 0.05;

const SUPPORTED_NETWORKS = [
  { chainId: CHAIN_ID, name: 'BSC Testnet', referralTreasuryAddress: REFERRAL_TREASURY_ADDRESS },
];

const WITHDRAW_TASK_BODY = {
  referrerWallet: REFERRER_WALLET,
  referrerId: 'referrer-1',
  chainId: CHAIN_ID,
  tokenAddress: TOKEN_ADDRESS,
  amount: '1000',
};

type FakeRepositories = {
  fees: FakeFeesRepository;
  referrals: FakeReferralRepository;
  withdraws: FakeReferrerWithdrawRepository;
  claims: FakeReferrerClaimHistoryRepository;
  commissions: FakeCommissionHistoryRepository;
};

type FakeClients = {
  signers: FakeSignersManagerClient;
};

function buildApp(repositories: FakeRepositories, clients: FakeClients) {
  // Stand-in for createRepositoriesPlugin: same decorator names, no mongoose connection.
  const repositoriesPlugin = new Elysia({ name: 'Repositories' })
    .decorate('feesRepository', repositories.fees)
    .decorate('referralRepository', repositories.referrals)
    .decorate('referrerClaimHistoryRepository', repositories.claims)
    .decorate('commissionHistoryRepository', repositories.commissions)
    .decorate('referrerWithdrawRepository', repositories.withdraws);

  // Stand-in for createClientsPlugin: same decorator names, no network.
  const clientsPlugin = new Elysia({ name: 'Clients' }).decorate('signersManagerClient', clients.signers);

  const servicesPlugin = createServicesPlugin(
    repositoriesPlugin as unknown as RepositoriesPlugin,
    clientsPlugin as unknown as ClientsPlugin,
    REFERRAL_REWARD_PERCENTAGE,
    SUPPORTED_NETWORKS,
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

describe('loyalty HTTP layer (component, fake repositories and clients)', () => {
  let repositories: FakeRepositories;
  let clients: FakeClients;
  let app: App;

  beforeEach(() => {
    repositories = {
      fees: createFakeFeesRepository(),
      referrals: createFakeReferralRepository(),
      withdraws: createFakeReferrerWithdrawRepository(),
      claims: createFakeReferrerClaimHistoryRepository(),
      commissions: createFakeCommissionHistoryRepository(),
    };
    clients = {
      signers: createFakeSignersManagerClient(),
    };
    app = buildApp(repositories, clients);
  });

  test('registerReferral: registers a referral that is visible through getReferrals', async () => {
    const created = await post(app, '/registerReferral', {
      userWallet: USER_WALLET,
      userId: 'user-1',
      referrerWallet: REFERRER_WALLET,
      referrerId: 'referrer-1',
    });

    expect(created.status).toBe(200);
    expect(created.body.userWallet).toBe(USER_WALLET);
    expect(created.body.referrerWallet).toBe(REFERRER_WALLET);
    expect(typeof created.body.id).toBe('string');
    expect(created.body).not.toHaveProperty('_id');

    const list = await post(app, '/getReferrals', { filter: { userWallet: USER_WALLET } });
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
    expect(list.body[0]).not.toHaveProperty('_id');
  });

  test('registerReferral: a second registration for the same user maps to 409 NOT_ALLOWED', async () => {
    await post(app, '/registerReferral', { userWallet: USER_WALLET, userId: 'user-1' });

    const duplicate = await post(app, '/registerReferral', { userWallet: REFERRER_WALLET, userId: 'user-1' });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({
      error: { code: 'NOT_ALLOWED', message: 'User already has a referrer' },
    });
    expect(repositories.referrals.create).toHaveBeenCalledTimes(1);
  });

  test('registerReferral: self-referral maps to 409 NOT_ALLOWED', async () => {
    const response = await post(app, '/registerReferral', {
      userWallet: USER_WALLET,
      userId: 'user-1',
      referrerWallet: USER_WALLET,
      referrerId: 'referrer-1',
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { code: 'NOT_ALLOWED', message: 'User cannot refer themselves' },
    });
    expect(repositories.referrals.create).toHaveBeenCalledTimes(0);
  });

  test('registerReferral: an invalid wallet never reaches the repository', async () => {
    const response = await post(app, '/registerReferral', { userWallet: 'not-a-wallet', userId: 'user-1' });

    expect(response.status).not.toBe(200);
    expect(repositories.referrals.create).toHaveBeenCalledTimes(0);
  });

  test('createReferrerWithdrawTask: creates a signature task and blocks the next call by cooldown', async () => {
    repositories.fees.seed({
      userWallet: REFERRER_WALLET,
      userId: 'referrer-1',
      chainId: CHAIN_ID,
      tokenAddress: TOKEN_ADDRESS,
      referralRewardAmount: '1000',
    });

    const created = await post(app, '/createReferrerWithdrawTask', WITHDRAW_TASK_BODY);

    expect(created.status).toBe(200);
    expect(created.body.taskId).toBe(FAKE_SIGNERS_TASK_ID);
    expect(created.body.totalWithdrawnAmount).toBe('0');
    expect(typeof created.body.taskExpiredAt).toBe('number');
    expect(typeof created.body.taskCooldown).toBe('number');
    expect(created.body).not.toHaveProperty('_id');

    expect(clients.signers.createSignatureTask.post).toHaveBeenCalledTimes(1);
    const taskPayload = clients.signers.createSignatureTask.post.mock.calls[0][0];
    expect(taskPayload.ownerId).toBe('referrer-1');
    expect(taskPayload.ownerType).toBe('user');
    expect(taskPayload.requiredSignatures).toBe(3);
    expect(taskPayload.hash).toMatch(/^0x[0-9a-f]{64}$/);

    const blocked = await post(app, '/createReferrerWithdrawTask', WITHDRAW_TASK_BODY);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('NOT_ALLOWED');
    expect(blocked.body.error.message).toMatch(/^Cooldown period active\. Try again in \d+ seconds$/);
    expect(clients.signers.createSignatureTask.post).toHaveBeenCalledTimes(1);
  });

  test('createReferrerWithdrawTask: an unsupported chain maps to 403 NOT_ALLOWED', async () => {
    const response = await post(app, '/createReferrerWithdrawTask', {
      ...WITHDRAW_TASK_BODY,
      chainId: UNSUPPORTED_CHAIN_ID,
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'NOT_ALLOWED', message: `Chain ID ${UNSUPPORTED_CHAIN_ID} is not supported` },
    });
    expect(clients.signers.createSignatureTask.post).toHaveBeenCalledTimes(0);
  });

  test('createReferrerWithdrawTask: a token without rewards maps to 403 NOT_ALLOWED', async () => {
    const response = await post(app, '/createReferrerWithdrawTask', WITHDRAW_TASK_BODY);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'NOT_ALLOWED', message: 'No referral rewards found for this token' },
    });
    expect(clients.signers.createSignatureTask.post).toHaveBeenCalledTimes(0);
  });

  test('createReferrerWithdrawTask: an amount above the available rewards reports the available amount', async () => {
    repositories.fees.seed({
      userWallet: REFERRER_WALLET,
      userId: 'referrer-1',
      chainId: CHAIN_ID,
      tokenAddress: TOKEN_ADDRESS,
      referralRewardAmount: '250',
    });

    const response = await post(app, '/createReferrerWithdrawTask', { ...WITHDRAW_TASK_BODY, amount: '251' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_ALLOWED',
        message: 'Requested amount exceeds available rewards. Available: 250',
      },
    });
  });

  test('getFees: filter and seeded documents round-trip through the HTTP layer', async () => {
    repositories.fees.seed({
      userWallet: USER_WALLET,
      userId: 'user-1',
      chainId: CHAIN_ID,
      tokenAddress: TOKEN_ADDRESS,
      buyCommissionAmount: '250',
      buyCommissionCount: 3,
    });

    const response = await post(app, '/getFees', { filter: { userWallet: USER_WALLET } });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].buyCommissionAmount).toBe('250');
    expect(response.body[0].buyCommissionCount).toBe(3);
    // Amounts without a value map to '0' through the whole stack.
    expect(response.body[0].sellCommissionAmount).toBe('0');
    expect(response.body[0].referralRewardAmount).toBe('0');
    expect(response.body[0]).not.toHaveProperty('_id');
  });

  test('getFees: pagination is applied by the repository', async () => {
    repositories.fees.seed({
      userWallet: USER_WALLET,
      userId: 'user-1',
      chainId: CHAIN_ID,
      tokenAddress: TOKEN_ADDRESS,
      buyCommissionAmount: '1',
    });
    repositories.fees.seed({
      userWallet: USER_WALLET,
      userId: 'user-1',
      chainId: CHAIN_ID,
      tokenAddress: '0x' + '88'.repeat(20),
      buyCommissionAmount: '2',
    });

    const response = await post(app, '/getFees', { filter: { userWallet: USER_WALLET }, limit: 1, offset: 1 });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].buyCommissionAmount).toBe('2');
  });

  test('history endpoints: withdraws, claims and commissions are listed and mapped', async () => {
    repositories.withdraws.seed({
      referrerWallet: REFERRER_WALLET,
      referrerId: 'referrer-1',
      chainId: CHAIN_ID,
      tokenAddress: TOKEN_ADDRESS,
      totalWithdrawnAmount: '42',
      taskId: 'task-9',
      taskExpiredAt: 1700000600,
      taskCooldown: 1702592000,
    });
    repositories.claims.seed({
      referrerWallet: REFERRER_WALLET,
      referrerId: 'referrer-1',
      referralWallet: USER_WALLET,
      chainId: CHAIN_ID,
      tokenAddress: TOKEN_ADDRESS,
      amount: '150',
      transactionHash: TRANSACTION_HASH,
      logIndex: 3,
      blockNumber: 99,
    });
    repositories.commissions.seed({
      userWallet: REFERRER_WALLET,
      userId: 'referrer-1',
      chainId: CHAIN_ID,
      tokenAddress: TOKEN_ADDRESS,
      amount: '7',
      actionType: 'referral_reward',
      transactionHash: TRANSACTION_HASH,
      relatedUserWallet: USER_WALLET,
      relatedUserId: 'user-1',
    });

    const withdrawsList = await post(app, '/getReferrerWithdraws', { filter: { referrerId: 'referrer-1' } });
    expect(withdrawsList.status).toBe(200);
    expect(withdrawsList.body).toHaveLength(1);
    expect(withdrawsList.body[0].totalWithdrawnAmount).toBe('42');
    expect(withdrawsList.body[0].taskId).toBe('task-9');
    expect(withdrawsList.body[0]).not.toHaveProperty('_id');

    const claimsList = await post(app, '/getReferrerClaimHistory', { filter: { referrerWallet: REFERRER_WALLET } });
    expect(claimsList.status).toBe(200);
    expect(claimsList.body).toHaveLength(1);
    expect(claimsList.body[0].amount).toBe('150');
    expect(claimsList.body[0].referralWallet).toBe(USER_WALLET);
    expect(claimsList.body[0].logIndex).toBe(3);
    expect(claimsList.body[0].blockNumber).toBe(99);

    const commissionsList = await post(app, '/getCommissionHistory', { filter: { actionType: 'referral_reward' } });
    expect(commissionsList.status).toBe(200);
    expect(commissionsList.body).toHaveLength(1);
    expect(commissionsList.body[0].actionType).toBe('referral_reward');
    expect(commissionsList.body[0].amount).toBe('7');
    expect(commissionsList.body[0].relatedUserWallet).toBe(USER_WALLET);
    expect(commissionsList.body[0].relatedUserId).toBe('user-1');
  });

  test('listing endpoints return empty arrays over HTTP', async () => {
    const referrals = await post(app, '/getReferrals', { filter: {} });
    expect(referrals.status).toBe(200);
    expect(referrals.body).toEqual([]);

    const commissions = await post(app, '/getCommissionHistory', { filter: {} });
    expect(commissions.status).toBe(200);
    expect(commissions.body).toEqual([]);
  });
});
