/**
 * Unit tests for LoyaltyService.
 *
 * Scope: the service layer only. The five repositories are replaced with
 * in-memory fakes (tests/fakes/*.fake.ts) and the signers-manager Eden client
 * with a fake envelope, so these tests need no database, no broker and no
 * network. Run with `bun test` from services/loyalty.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import mongoose from 'mongoose';
import { ethers } from 'ethers';
import { AppError } from '@shared/errors/app-errors';
import type { BlockchainEvent } from '@shared/blockchain';
import { LoyaltyService } from '../src/services/loyalty.service';
import type { FeesRepository } from '../src/repositories/fees.repository';
import type { ReferralRepository } from '../src/repositories/referral.repository';
import type { ReferrerWithdrawRepository } from '../src/repositories/referrerWithdraw.repository';
import type { ReferrerClaimHistoryRepository } from '../src/repositories/referrerClaimHistory.repository';
import type { CommissionHistoryRepository } from '../src/repositories/commissionHistory.repository';
import type { SignersManagerClient } from '../src/clients/eden.clients';
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
const REFERRED_USER_WALLET = '0x' + '55'.repeat(20);
const TRANSACTION_HASH = '0x' + 'ab'.repeat(32);
const LOG_INDEX = 7;
const BLOCK_NUMBER = 123456;
const REFERRAL_REWARD_PERCENTAGE = 0.05;

// Checksum-cased variant of a valid 20-byte address; the service lowercases it.
const MIXED_CASE_WALLET = `0xAbCdEf${'0'.repeat(33)}1`;
const LOWER_CASED_WALLET = MIXED_CASE_WALLET.toLowerCase();

const SUPPORTED_NETWORKS = [
  { chainId: CHAIN_ID, name: 'BSC Testnet', referralTreasuryAddress: REFERRAL_TREASURY_ADDRESS },
];

// The builders return exactly the event shapes the service declares for each
// handler; the daemon passes the full BlockchainEvent decoded from the chain,
// so the tests build the same full event objects.
type FeeCollectedSyntheticEvent = BlockchainEvent<{ sender: string; amount: string; token: string }>;

type RwaMintedSyntheticEvent = BlockchainEvent<{
  minter: string;
  rwaAmountMinted: string;
  holdAmountPaid: string;
  feePaid: string;
  percentBefore: string;
  userPercent: string;
  targetReached: boolean;
  businessId: string;
  poolId: string;
  holdToken: string;
}>;
type RwaBurnedSyntheticEvent = BlockchainEvent<{
  burner: string;
  rwaAmountBurned: string;
  holdAmountReceived: string;
  bonusAmountReceived: string;
  holdFeePaid: string;
  bonusFeePaid: string;
  percentBefore: string;
  userPercent: string;
  targetReached: boolean;
  businessId: string;
  poolId: string;
  holdToken: string;
}>;
type TreasuryWithdrawnSyntheticEvent = BlockchainEvent<{ user: string; token: string; amount: string }>;

function buildTokenFeeEvent(
  overrides: { sender?: string; amount?: string; token?: string } = {},
): FeeCollectedSyntheticEvent {
  return {
    data: {
      sender: overrides.sender ?? LOWER_CASED_WALLET,
      amount: overrides.amount ?? '1000000',
      token: overrides.token ?? TOKEN_ADDRESS,
    },
    chainId: CHAIN_ID,
    name: 'Factory_CreateRWAFeeCollected',
    address: TOKEN_ADDRESS,
    timestamp: 1_700_000_000,
    transactionHash: TRANSACTION_HASH,
    logIndex: LOG_INDEX,
    blockNumber: BLOCK_NUMBER,
  };
}

function buildPoolFeeEvent(
  overrides: { sender?: string; amount?: string; token?: string } = {},
): FeeCollectedSyntheticEvent {
  return {
    data: {
      sender: overrides.sender ?? LOWER_CASED_WALLET,
      amount: overrides.amount ?? '2000000',
      token: overrides.token ?? TOKEN_ADDRESS,
    },
    chainId: CHAIN_ID,
    name: 'Factory_CreatePoolFeeCollected',
    address: TOKEN_ADDRESS,
    timestamp: 1_700_000_000,
    transactionHash: TRANSACTION_HASH,
    logIndex: LOG_INDEX,
    blockNumber: BLOCK_NUMBER,
  };
}

function buildRwaMintedEvent(overrides: { minter?: string; feePaid?: string } = {}): RwaMintedSyntheticEvent {
  return {
    data: {
      minter: overrides.minter ?? LOWER_CASED_WALLET,
      rwaAmountMinted: '1000000000000000000',
      holdAmountPaid: '1000000000000000000',
      feePaid: overrides.feePaid ?? '5000000',
      percentBefore: '0',
      userPercent: '1',
      targetReached: true,
      businessId: 'business-1',
      poolId: 'pool-1',
      holdToken: TOKEN_ADDRESS,
    },
    chainId: CHAIN_ID,
    name: 'Pool_RwaMinted',
    address: TOKEN_ADDRESS,
    timestamp: 1_700_000_000,
    transactionHash: TRANSACTION_HASH,
    logIndex: LOG_INDEX,
    blockNumber: BLOCK_NUMBER,
  };
}

function buildRwaBurnedEvent(
  overrides: { burner?: string; holdFeePaid?: string; bonusFeePaid?: string } = {},
): RwaBurnedSyntheticEvent {
  return {
    data: {
      burner: overrides.burner ?? LOWER_CASED_WALLET,
      rwaAmountBurned: '1000000000000000000',
      holdAmountReceived: '900000',
      bonusAmountReceived: '100000',
      holdFeePaid: overrides.holdFeePaid ?? '3000000',
      bonusFeePaid: overrides.bonusFeePaid ?? '1000000',
      percentBefore: '0',
      userPercent: '1',
      targetReached: true,
      businessId: 'business-1',
      poolId: 'pool-1',
      holdToken: TOKEN_ADDRESS,
    },
    chainId: CHAIN_ID,
    name: 'Pool_RwaBurned',
    address: TOKEN_ADDRESS,
    timestamp: 1_700_000_000,
    transactionHash: TRANSACTION_HASH,
    logIndex: LOG_INDEX,
    blockNumber: BLOCK_NUMBER,
  };
}

function buildTreasuryWithdrawnEvent(
  overrides: { user?: string; token?: string; amount?: string } = {},
): TreasuryWithdrawnSyntheticEvent {
  return {
    data: {
      user: overrides.user ?? LOWER_CASED_WALLET,
      token: overrides.token ?? TOKEN_ADDRESS,
      amount: overrides.amount ?? '700',
    },
    chainId: CHAIN_ID,
    name: 'ReferralTreasury_Withdrawn',
    address: REFERRAL_TREASURY_ADDRESS,
    timestamp: 1_700_000_000,
    transactionHash: TRANSACTION_HASH,
    logIndex: LOG_INDEX,
    blockNumber: BLOCK_NUMBER,
  };
}

/**
 * Independently recomputes the withdraw message hash the service must produce
 * (spec-level assertion, mirrors the encoding used by the contract).
 */
function expectedWithdrawMessageHash(amount: string): string {
  return ethers.solidityPackedKeccak256(
    ['uint256', 'address', 'address', 'string', 'address', 'uint256'],
    [
      BigInt(CHAIN_ID),
      ethers.getAddress(REFERRAL_TREASURY_ADDRESS),
      ethers.getAddress(REFERRER_WALLET),
      'withdraw',
      ethers.getAddress(TOKEN_ADDRESS),
      BigInt(amount),
    ],
  );
}

describe('LoyaltyService (unit, fake repositories and clients)', () => {
  let fees: FakeFeesRepository;
  let referrals: FakeReferralRepository;
  let withdraws: FakeReferrerWithdrawRepository;
  let claims: FakeReferrerClaimHistoryRepository;
  let commissions: FakeCommissionHistoryRepository;
  let signers: FakeSignersManagerClient;
  // The proxy appends the commit closure, so the call sites keep one argument.
  let service: any;
  let commitInbox: ReturnType<typeof mock<() => Promise<void>>>;

  beforeEach(() => {
    fees = createFakeFeesRepository();
    referrals = createFakeReferralRepository();
    withdraws = createFakeReferrerWithdrawRepository();
    claims = createFakeReferrerClaimHistoryRepository();
    commissions = createFakeCommissionHistoryRepository();
    signers = createFakeSignersManagerClient();

    // The service writes its rows and the inbox marker in one transaction.
    (mongoose.connection as unknown as { transaction: unknown }).transaction = async <T>(
      fn: () => Promise<T>,
    ): Promise<T> => fn();

    commitInbox = mock(async (): Promise<void> => undefined);

    const raw = new LoyaltyService(
      fees as unknown as FeesRepository,
      referrals as unknown as ReferralRepository,
      withdraws as unknown as ReferrerWithdrawRepository,
      claims as unknown as ReferrerClaimHistoryRepository,
      commissions as unknown as CommissionHistoryRepository,
      REFERRAL_REWARD_PERCENTAGE,
      signers as unknown as SignersManagerClient,
      SUPPORTED_NETWORKS,
    );
    // Every handler now takes the commit closure: the proxy appends it.
    service = new Proxy(raw, {
      get: (target, property, receiver) => {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== 'function') return value;

        return (...args: unknown[]) => value.apply(target, [...args, commitInbox]);
      },
    }) as LoyaltyService;
  });

  /** Seeds the referral row of a user that was invited by REFERRER_WALLET. */
  function seedReferredUser(overrides: Partial<Parameters<FakeReferralRepository['seed']>[0]> = {}) {
    return referrals.seed({
      userWallet: LOWER_CASED_WALLET,
      userId: 'user-1',
      referrerWallet: REFERRER_WALLET,
      referrerId: 'referrer-1',
      ...overrides,
    });
  }

  function seedReferrerRewardFees(reward: string) {
    return fees.seed({
      userWallet: REFERRER_WALLET,
      userId: 'referrer-1',
      chainId: CHAIN_ID,
      tokenAddress: TOKEN_ADDRESS,
      referralRewardAmount: reward,
    });
  }

  function seedWithdrawRecord(overrides: Partial<Parameters<FakeReferrerWithdrawRepository['seed']>[0]> = {}) {
    return withdraws.seed({
      referrerWallet: REFERRER_WALLET,
      referrerId: 'referrer-1',
      chainId: CHAIN_ID,
      tokenAddress: TOKEN_ADDRESS,
      ...overrides,
    });
  }

  describe('registerReferral', () => {
    test('forwards the payload and returns a mapped referral', async () => {
      const referral = await service.registerReferral({
        userWallet: USER_WALLET,
        userId: 'user-1',
        referrerWallet: REFERRER_WALLET,
        referrerId: 'referrer-1',
      });

      expect(referrals.create).toHaveBeenCalledTimes(1);
      expect(referrals.create).toHaveBeenCalledWith({
        userWallet: USER_WALLET,
        userId: 'user-1',
        referrerWallet: REFERRER_WALLET,
        referrerId: 'referrer-1',
      });
      expect(typeof referral.id).toBe('string');
      expect(referral.id).toHaveLength(24); // Mongo ObjectId hex
      expect(referral.userWallet).toBe(USER_WALLET);
      expect(referral.userId).toBe('user-1');
      expect(referral.referrerWallet).toBe(REFERRER_WALLET);
      expect(referral.referrerId).toBe('referrer-1');
      expect(typeof referral.createdAt).toBe('number');
      expect(referral).not.toHaveProperty('_id');
      // The result must be plain JSON — no ObjectId or class instances leaking to the caller.
      expect(JSON.parse(JSON.stringify(referral))).toEqual(referral);
    });

    test('stores undefined referrer fields when no referrer is given', async () => {
      const referral = await service.registerReferral({ userWallet: USER_WALLET, userId: 'user-1' });

      const payload = referrals.create.mock.calls[0][0];
      expect(payload.referrerWallet).toBeUndefined();
      expect(payload.referrerId).toBeUndefined();
      expect(referral.referrerWallet).toBeUndefined();
      expect(referral.referrerId).toBeUndefined();
      expect(Object.keys(JSON.parse(JSON.stringify(referral)))).not.toContain('_id');
    });

    test('rejects a user that already has a referrer', async () => {
      referrals.seed({ userWallet: USER_WALLET, userId: 'user-1' });

      await expect(service.registerReferral({ userWallet: USER_WALLET, userId: 'user-1' })).rejects.toMatchObject({
        statusCode: 409,
        code: 'NOT_ALLOWED',
        message: 'User already has a referrer',
      });
      expect(referrals.create).toHaveBeenCalledTimes(0);
    });

    test('rejects self-referral by userId', async () => {
      await expect(
        service.registerReferral({ userWallet: USER_WALLET, userId: 'same-user', referrerId: 'same-user' }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'NOT_ALLOWED',
        message: 'User cannot refer themselves',
      });
      expect(referrals.create).toHaveBeenCalledTimes(0);
    });

    test('rejects self-referral by wallet regardless of case', async () => {
      await expect(
        service.registerReferral({
          userWallet: MIXED_CASE_WALLET,
          userId: 'user-1',
          referrerWallet: LOWER_CASED_WALLET,
          referrerId: 'referrer-1',
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'NOT_ALLOWED',
        message: 'User cannot refer themselves',
      });
      expect(referrals.create).toHaveBeenCalledTimes(0);
    });
  });

  describe('processCreateRWAFeeCollected', () => {
    test('throws NOT_FOUND for a sender without a referral', async () => {
      await expect(service.processCreateRWAFeeCollected(buildTokenFeeEvent())).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });

      expect(referrals.findByUserWallet).toHaveBeenCalledWith(LOWER_CASED_WALLET);
      expect(fees.addTokenCreationCommission).toHaveBeenCalledTimes(0);
      expect(commissions.create).toHaveBeenCalledTimes(0);
      expect(claims.create).toHaveBeenCalledTimes(0);
      expect(commitInbox).toHaveBeenCalledTimes(0);
    });

    test('records the token-creation commission for a referred user without a referrer', async () => {
      referrals.seed({ userWallet: LOWER_CASED_WALLET, userId: 'user-1' });

      await service.processCreateRWAFeeCollected(buildTokenFeeEvent());

      expect(fees.addTokenCreationCommission).toHaveBeenCalledWith(
        LOWER_CASED_WALLET,
        'user-1',
        CHAIN_ID,
        TOKEN_ADDRESS,
        '1000000',
      );

      expect(commissions.create).toHaveBeenCalledTimes(1);
      const history = commissions.create.mock.calls[0][0];
      expect(history).toMatchObject({
        userWallet: LOWER_CASED_WALLET,
        userId: 'user-1',
        chainId: CHAIN_ID,
        tokenAddress: TOKEN_ADDRESS,
        amount: '1000000',
        actionType: 'token_creation_commission',
        transactionHash: TRANSACTION_HASH,
      });
      expect(history.relatedUserWallet).toBeUndefined();
      expect(history.relatedUserId).toBeUndefined();

      // No referrer on the referral row -> nobody gets a reward.
      expect(claims.create).toHaveBeenCalledTimes(0);
      expect(fees.addReferralReward).toHaveBeenCalledTimes(0);
    });

    test('lowercases the sender before every lookup and write', async () => {
      referrals.seed({ userWallet: LOWER_CASED_WALLET, userId: 'user-1' });

      await service.processCreateRWAFeeCollected(buildTokenFeeEvent({ sender: MIXED_CASE_WALLET }));

      expect(referrals.findByUserWallet).toHaveBeenCalledWith(LOWER_CASED_WALLET);
      expect(fees.addTokenCreationCommission).toHaveBeenCalledWith(
        LOWER_CASED_WALLET,
        'user-1',
        CHAIN_ID,
        TOKEN_ADDRESS,
        '1000000',
      );
      expect(commissions.create.mock.calls[0][0].userWallet).toBe(LOWER_CASED_WALLET);
    });

    test('credits the referrer reward with the configured percentage', async () => {
      seedReferredUser();

      await service.processCreateRWAFeeCollected(buildTokenFeeEvent({ amount: '1000000' }));

      // 5% of 1000000 = 50000, computed through BigInt in the service.
      expect(claims.create).toHaveBeenCalledWith({
        referrerWallet: REFERRER_WALLET,
        referrerId: 'referrer-1',
        chainId: CHAIN_ID,
        tokenAddress: TOKEN_ADDRESS,
        referralWallet: LOWER_CASED_WALLET,
        amount: '50000',
        transactionHash: TRANSACTION_HASH,
        logIndex: LOG_INDEX,
        blockNumber: BLOCK_NUMBER,
      });
      expect(fees.addReferralReward).toHaveBeenCalledWith(
        REFERRER_WALLET,
        'referrer-1',
        CHAIN_ID,
        TOKEN_ADDRESS,
        '50000',
      );

      expect(commissions.create).toHaveBeenCalledTimes(2);
      expect(commissions.create.mock.calls[1][0]).toMatchObject({
        userWallet: REFERRER_WALLET,
        userId: 'referrer-1',
        chainId: CHAIN_ID,
        tokenAddress: TOKEN_ADDRESS,
        amount: '50000',
        actionType: 'referral_reward',
        transactionHash: TRANSACTION_HASH,
        relatedUserWallet: LOWER_CASED_WALLET,
        relatedUserId: 'user-1',
      });
    });

    test('keeps BigInt precision for commissions above Number.MAX_SAFE_INTEGER', async () => {
      seedReferredUser();

      await service.processCreateRWAFeeCollected(buildTokenFeeEvent({ amount: '9007199254740993000000' }));

      // 9007199254740993000000 * 5% = 450359962737049650000 exactly.
      expect(fees.addReferralReward).toHaveBeenCalledWith(
        REFERRER_WALLET,
        'referrer-1',
        CHAIN_ID,
        TOKEN_ADDRESS,
        '450359962737049650000',
      );
    });

    test('skips the reward for a re-delivered event (duplicate claim-history key)', async () => {
      seedReferredUser();
      const duplicateKeyError = Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
      claims.create.mockImplementationOnce(async () => {
        throw duplicateKeyError;
      });

      await service.processCreateRWAFeeCollected(buildTokenFeeEvent());

      expect(claims.create).toHaveBeenCalledTimes(1);
      expect(fees.addReferralReward).toHaveBeenCalledTimes(0);
      // Only the commission-history row of the commission itself was written.
      expect(commissions.create).toHaveBeenCalledTimes(1);
      expect(commissions.create.mock.calls[0][0].actionType).toBe('token_creation_commission');
    });

    test('propagates non-duplicate errors from the claim-history write', async () => {
      seedReferredUser();
      claims.create.mockImplementationOnce(async () => {
        throw new AppError({ message: 'claim history write failed', statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
      });

      await expect(service.processCreateRWAFeeCollected(buildTokenFeeEvent())).rejects.toMatchObject({
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
      });
      expect(fees.addReferralReward).toHaveBeenCalledTimes(0);
    });
  });

  describe('processCreatePoolFeeCollected', () => {
    test('throws NOT_FOUND for a sender without a referral', async () => {
      await expect(service.processCreatePoolFeeCollected(buildPoolFeeEvent())).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });

      expect(fees.addPoolCreationCommission).toHaveBeenCalledTimes(0);
      expect(commissions.create).toHaveBeenCalledTimes(0);
      expect(commitInbox).toHaveBeenCalledTimes(0);
    });

    test('records the pool-creation commission and pays the referrer', async () => {
      seedReferredUser();

      await service.processCreatePoolFeeCollected(buildPoolFeeEvent());

      expect(fees.addPoolCreationCommission).toHaveBeenCalledWith(
        LOWER_CASED_WALLET,
        'user-1',
        CHAIN_ID,
        TOKEN_ADDRESS,
        '2000000',
      );
      expect(commissions.create.mock.calls[0][0]).toMatchObject({
        actionType: 'pool_creation_commission',
        amount: '2000000',
      });
      // 5% of 2000000.
      expect(fees.addReferralReward).toHaveBeenCalledWith(
        REFERRER_WALLET,
        'referrer-1',
        CHAIN_ID,
        TOKEN_ADDRESS,
        '100000',
      );
      expect(claims.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('processRwaMinted', () => {
    test('throws NOT_FOUND for a minter without a referral', async () => {
      await expect(service.processRwaMinted(buildRwaMintedEvent())).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });

      expect(fees.addBuyCommission).toHaveBeenCalledTimes(0);
      expect(commissions.create).toHaveBeenCalledTimes(0);
      expect(commitInbox).toHaveBeenCalledTimes(0);
    });

    test('records the buy commission with the paid fee and lowercased minter', async () => {
      referrals.seed({ userWallet: LOWER_CASED_WALLET, userId: 'user-1' });

      await service.processRwaMinted(buildRwaMintedEvent({ minter: MIXED_CASE_WALLET }));

      expect(referrals.findByUserWallet).toHaveBeenCalledWith(LOWER_CASED_WALLET);
      expect(fees.addBuyCommission).toHaveBeenCalledWith(
        LOWER_CASED_WALLET,
        'user-1',
        CHAIN_ID,
        TOKEN_ADDRESS,
        '5000000',
      );
      expect(commissions.create).toHaveBeenCalledTimes(1);
      expect(commissions.create.mock.calls[0][0]).toMatchObject({
        userWallet: LOWER_CASED_WALLET,
        actionType: 'buy_commission',
        tokenAddress: TOKEN_ADDRESS,
        amount: '5000000',
        transactionHash: TRANSACTION_HASH,
      });
    });

    test('pays the referrer reward on the buy commission', async () => {
      seedReferredUser();

      await service.processRwaMinted(buildRwaMintedEvent({ feePaid: '5000000' }));

      // 5% of 5000000.
      expect(fees.addReferralReward).toHaveBeenCalledWith(
        REFERRER_WALLET,
        'referrer-1',
        CHAIN_ID,
        TOKEN_ADDRESS,
        '250000',
      );
      expect(claims.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('processRwaBurned', () => {
    test('throws NOT_FOUND for a burner without a referral', async () => {
      await expect(service.processRwaBurned(buildRwaBurnedEvent())).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });

      expect(fees.addSellCommission).toHaveBeenCalledTimes(0);
      expect(commissions.create).toHaveBeenCalledTimes(0);
      expect(commitInbox).toHaveBeenCalledTimes(0);
    });

    test('records the sell commission as the sum of hold and bonus fees', async () => {
      referrals.seed({ userWallet: LOWER_CASED_WALLET, userId: 'user-1' });

      await service.processRwaBurned(buildRwaBurnedEvent({ holdFeePaid: '3000000', bonusFeePaid: '1000000' }));

      expect(fees.addSellCommission).toHaveBeenCalledWith(
        LOWER_CASED_WALLET,
        'user-1',
        CHAIN_ID,
        TOKEN_ADDRESS,
        '4000000',
      );
      expect(commissions.create.mock.calls[0][0]).toMatchObject({
        actionType: 'sell_commission',
        amount: '4000000',
        tokenAddress: TOKEN_ADDRESS,
      });
    });

    test('sums the fees exactly with BigInt for values above Number.MAX_SAFE_INTEGER', async () => {
      seedReferredUser();

      await service.processRwaBurned(buildRwaBurnedEvent({ holdFeePaid: '9007199254740993', bonusFeePaid: '1' }));

      // A Number-based sum would round this to ...992; BigInt keeps ...994.
      expect(fees.addSellCommission).toHaveBeenCalledWith(
        LOWER_CASED_WALLET,
        'user-1',
        CHAIN_ID,
        TOKEN_ADDRESS,
        '9007199254740994',
      );
      expect(commissions.create.mock.calls[0][0].amount).toBe('9007199254740994');
    });
  });

  describe('processReferralTreasuryWithdrawn', () => {
    test('throws NOT_FOUND for an unknown referrer wallet', async () => {
      await expect(service.processReferralTreasuryWithdrawn(buildTreasuryWithdrawnEvent())).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });

      expect(referrals.findByReferrerWallet).toHaveBeenCalledWith(LOWER_CASED_WALLET);
      expect(withdraws.addWithdrawnAmount).toHaveBeenCalledTimes(0);
      expect(commitInbox).toHaveBeenCalledTimes(0);
    });

    test('throws NOT_FOUND for a referral row without referrerId', async () => {
      referrals.seed({ userWallet: REFERRED_USER_WALLET, userId: 'user-2', referrerWallet: LOWER_CASED_WALLET });

      await expect(service.processReferralTreasuryWithdrawn(buildTreasuryWithdrawnEvent())).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });

      expect(withdraws.addWithdrawnAmount).toHaveBeenCalledTimes(0);
      expect(commitInbox).toHaveBeenCalledTimes(0);
    });

    test('adds the withdrawn amount to the referrer record', async () => {
      referrals.seed({
        userWallet: REFERRED_USER_WALLET,
        userId: 'user-2',
        referrerWallet: LOWER_CASED_WALLET,
        referrerId: 'referrer-9',
      });

      const result = await service.processReferralTreasuryWithdrawn(
        buildTreasuryWithdrawnEvent({ user: MIXED_CASE_WALLET, amount: '700' }),
      );

      expect(result).toBeUndefined();
      expect(withdraws.addWithdrawnAmount).toHaveBeenCalledWith(
        LOWER_CASED_WALLET,
        'referrer-9',
        CHAIN_ID,
        TOKEN_ADDRESS,
        '700',
      );
    });
  });

  describe('createReferrerWithdrawTask', () => {
    const withdrawTaskParams = {
      referrerWallet: REFERRER_WALLET,
      referrerId: 'referrer-1',
      chainId: CHAIN_ID,
      tokenAddress: TOKEN_ADDRESS,
      amount: '400',
    };

    test('rejects an unsupported chain id before any lookup', async () => {
      await expect(
        service.createReferrerWithdrawTask({ ...withdrawTaskParams, chainId: UNSUPPORTED_CHAIN_ID }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'NOT_ALLOWED',
        message: `Chain ID ${UNSUPPORTED_CHAIN_ID} is not supported`,
      });

      expect(fees.findAll).toHaveBeenCalledTimes(0);
      expect(signers.createSignatureTask.post).toHaveBeenCalledTimes(0);
    });

    test('rejects a token without any referral rewards', async () => {
      await expect(service.createReferrerWithdrawTask(withdrawTaskParams)).rejects.toMatchObject({
        statusCode: 403,
        code: 'NOT_ALLOWED',
        message: 'No referral rewards found for this token',
      });

      expect(signers.createSignatureTask.post).toHaveBeenCalledTimes(0);
    });

    test('forwards the fee filter and rejects when nothing is available', async () => {
      seedReferrerRewardFees('0');

      await expect(service.createReferrerWithdrawTask(withdrawTaskParams)).rejects.toMatchObject({
        statusCode: 403,
        code: 'NOT_ALLOWED',
        message: 'No rewards available for withdrawal',
      });

      expect(fees.findAll).toHaveBeenCalledWith({
        userWallet: REFERRER_WALLET,
        userId: 'referrer-1',
        chainId: CHAIN_ID,
        tokenAddress: TOKEN_ADDRESS,
      });
    });

    test('rejects when the withdrawn amount already exceeds the rewards', async () => {
      seedReferrerRewardFees('100');
      seedWithdrawRecord({ totalWithdrawnAmount: '250' });

      await expect(service.createReferrerWithdrawTask({ ...withdrawTaskParams, amount: '1' })).rejects.toMatchObject({
        statusCode: 403,
        code: 'NOT_ALLOWED',
        message: 'No rewards available for withdrawal',
      });

      expect(signers.createSignatureTask.post).toHaveBeenCalledTimes(0);
    });

    test('rejects an amount above the available rewards', async () => {
      seedReferrerRewardFees('1000');
      seedWithdrawRecord({ totalWithdrawnAmount: '100' });

      await expect(service.createReferrerWithdrawTask({ ...withdrawTaskParams, amount: '901' })).rejects.toMatchObject({
        statusCode: 403,
        code: 'NOT_ALLOWED',
        message: 'Requested amount exceeds available rewards. Available: 900',
      });

      expect(signers.createSignatureTask.post).toHaveBeenCalledTimes(0);
      expect(withdraws.createOrUpdate).toHaveBeenCalledTimes(0);
    });

    test('rejects while the cooldown window is active', async () => {
      seedReferrerRewardFees('1000');
      const nowSeconds = Math.floor(Date.now() / 1000);
      seedWithdrawRecord({ totalWithdrawnAmount: '0', taskCooldown: nowSeconds + 3600 });

      const error = await service.createReferrerWithdrawTask(withdrawTaskParams).catch((rejection: any) => rejection);

      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('NOT_ALLOWED');
      expect(error.message).toMatch(/^Cooldown period active\. Try again in \d+ seconds$/);
      expect(signers.createSignatureTask.post).toHaveBeenCalledTimes(0);
      expect(withdraws.createOrUpdate).toHaveBeenCalledTimes(0);
    });

    test('creates the signer task and stores the withdraw window', async () => {
      seedReferrerRewardFees('1000');
      const before = Math.floor(Date.now() / 1000);

      // amount equals the available amount exactly: the boundary is inclusive.
      const result = await service.createReferrerWithdrawTask({ ...withdrawTaskParams, amount: '1000' });
      const after = Math.floor(Date.now() / 1000);

      // Signers manager payload: owner, message hash and the 10-minute task expiry.
      expect(signers.createSignatureTask.post).toHaveBeenCalledTimes(1);
      const taskPayload = signers.createSignatureTask.post.mock.calls[0][0];
      expect(taskPayload.ownerId).toBe('referrer-1');
      expect(taskPayload.ownerType).toBe('user');
      expect(taskPayload.requiredSignatures).toBe(3);
      expect(taskPayload.hash).toBe(expectedWithdrawMessageHash('1000'));
      expect(taskPayload.expired).toBeGreaterThanOrEqual(before + 60 * 10);
      expect(taskPayload.expired).toBeLessThanOrEqual(after + 60 * 10);

      // Withdraw record: task id + expiry + cooldown (10 minutes / 30 days).
      expect(withdraws.createOrUpdate).toHaveBeenCalledTimes(1);
      const stored = withdraws.createOrUpdate.mock.calls[0][0];
      expect(stored.referrerWallet).toBe(REFERRER_WALLET);
      expect(stored.referrerId).toBe('referrer-1');
      expect(stored.chainId).toBe(CHAIN_ID);
      expect(stored.tokenAddress).toBe(TOKEN_ADDRESS);
      expect(String(stored.totalWithdrawnAmount)).toBe('0');
      expect(stored.taskId).toBe(FAKE_SIGNERS_TASK_ID);
      expect(stored.taskExpiredAt).toBe(taskPayload.expired);
      expect((stored.taskCooldown as number) - (stored.taskExpiredAt as number)).toBe(60 * 60 * 24 * 30 - 60 * 10);

      expect(typeof result.id).toBe('string');
      expect(result.id).toHaveLength(24);
      expect(result.taskId).toBe(FAKE_SIGNERS_TASK_ID);
      expect(result.totalWithdrawnAmount).toBe('0');
      expect(result).not.toHaveProperty('_id');
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });

    test('allows a new task once the cooldown expired and preserves the withdrawn total', async () => {
      seedReferrerRewardFees('1000');
      const nowSeconds = Math.floor(Date.now() / 1000);
      seedWithdrawRecord({ totalWithdrawnAmount: '100', taskCooldown: nowSeconds - 1, taskId: 'old-task' });

      const result = await service.createReferrerWithdrawTask({ ...withdrawTaskParams, amount: '900' });

      const stored = withdraws.createOrUpdate.mock.calls[0][0];
      expect(String(stored.totalWithdrawnAmount)).toBe('100');
      expect(stored.taskId).toBe(FAKE_SIGNERS_TASK_ID);
      expect(result.totalWithdrawnAmount).toBe('100');
    });

    test('propagates a signers-manager error and stores nothing', async () => {
      seedReferrerRewardFees('1000');
      const failure = new AppError({
        message: 'signers manager unavailable',
        statusCode: 502,
        code: 'SERVICE_UNAVAILABLE',
      });
      signers.createSignatureTask.post.mockResolvedValueOnce({ data: null, error: failure });

      await expect(service.createReferrerWithdrawTask(withdrawTaskParams)).rejects.toMatchObject({
        statusCode: 502,
        code: 'SERVICE_UNAVAILABLE',
      });

      expect(withdraws.createOrUpdate).toHaveBeenCalledTimes(0);
    });
  });

  describe('read APIs', () => {
    test('getFees: forwards filter/sort/pagination and maps documents to JSON-plain DTOs', async () => {
      const doc = fees.seed({
        userWallet: USER_WALLET,
        userId: 'user-1',
        chainId: CHAIN_ID,
        tokenAddress: TOKEN_ADDRESS,
        buyCommissionAmount: '250',
        buyCommissionCount: 3,
        referralRewardAmount: '10',
        referralRewardCount: 1,
      });
      fees.seed({
        userWallet: '0x' + '77'.repeat(20),
        userId: 'user-2',
        chainId: CHAIN_ID,
        tokenAddress: TOKEN_ADDRESS,
      });

      const result = await service.getFees({
        filter: { userWallet: USER_WALLET },
        sort: { createdAt: 'desc' },
        limit: 10,
        offset: 0,
      });

      expect(fees.findAll).toHaveBeenCalledWith({ userWallet: USER_WALLET }, { createdAt: 'desc' }, 10, 0);
      expect(result).toHaveLength(1);

      const fee = result[0];
      expect(fee.id).toBe(doc._id.toString());
      expect(fee.userWallet).toBe(USER_WALLET);
      expect(fee.buyCommissionAmount).toBe('250');
      expect(fee.buyCommissionCount).toBe(3);
      expect(fee.referralRewardAmount).toBe('10');
      expect(fee.referralRewardCount).toBe(1);
      // Amounts map to '0' and counts to 0 when the document has no value.
      expect(fee.sellCommissionAmount).toBe('0');
      expect(fee.tokenCreationCommissionAmount).toBe('0');
      expect(fee.poolCreationCommissionAmount).toBe('0');
      expect(fee.sellCommissionCount).toBe(0);
      expect(fee).not.toHaveProperty('_id');
      expect(JSON.parse(JSON.stringify(fee))).toEqual(fee);
    });

    test('getReferrals: forwards the filter and maps referral documents', async () => {
      const doc = referrals.seed({
        userWallet: USER_WALLET,
        userId: 'user-1',
        referrerWallet: REFERRER_WALLET,
        referrerId: 'referrer-1',
      });

      const result = await service.getReferrals({ filter: { userWallet: USER_WALLET }, limit: 5, offset: 0 });

      const call = referrals.findAll.mock.calls[0];
      expect(call[0]).toEqual({ userWallet: USER_WALLET });
      expect(call[1]).toBeUndefined();
      expect(call[2]).toBe(5);
      expect(call[3]).toBe(0);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(doc._id.toString());
      expect(result[0].userWallet).toBe(USER_WALLET);
      expect(result[0].referrerWallet).toBe(REFERRER_WALLET);
      expect(result[0].referrerId).toBe('referrer-1');
      expect(result[0]).not.toHaveProperty('_id');
      expect(JSON.parse(JSON.stringify(result[0]))).toEqual(result[0]);
    });

    test('getReferrals: maps a referral without referrer to a DTO without referrer fields', async () => {
      referrals.seed({ userWallet: USER_WALLET, userId: 'user-1' });

      const result = await service.getReferrals({ filter: {} });

      expect(result[0].referrerWallet).toBeUndefined();
      expect(result[0].referrerId).toBeUndefined();
      expect(Object.keys(JSON.parse(JSON.stringify(result[0])))).not.toContain('_id');
    });

    test('getReferrerWithdraws: forwards the filter and maps withdraw documents', async () => {
      const doc = withdraws.seed({
        referrerWallet: REFERRER_WALLET,
        referrerId: 'referrer-1',
        chainId: CHAIN_ID,
        tokenAddress: TOKEN_ADDRESS,
        totalWithdrawnAmount: '42',
        taskId: 'task-9',
        taskExpiredAt: 1700000600,
        taskCooldown: 1702592000,
      });

      const result = await service.getReferrerWithdraws({ filter: { referrerId: 'referrer-1' } });

      const call = withdraws.findAll.mock.calls[0];
      expect(call[0]).toEqual({ referrerId: 'referrer-1' });
      expect(call[1]).toBeUndefined();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(doc._id.toString());
      expect(result[0].totalWithdrawnAmount).toBe('42');
      expect(result[0].taskId).toBe('task-9');
      expect(result[0].taskExpiredAt).toBe(1700000600);
      expect(result[0].taskCooldown).toBe(1702592000);
      expect(result[0]).not.toHaveProperty('_id');
      expect(JSON.parse(JSON.stringify(result[0]))).toEqual(result[0]);
    });

    test('getReferrerWithdraws: maps a record without task info to a DTO without task fields', async () => {
      withdraws.seed({
        referrerWallet: REFERRER_WALLET,
        referrerId: 'referrer-1',
        chainId: CHAIN_ID,
        tokenAddress: TOKEN_ADDRESS,
      });

      const result = await service.getReferrerWithdraws({ filter: { referrerId: 'referrer-1' } });

      expect(result[0].totalWithdrawnAmount).toBe('0');
      expect(result[0].taskId).toBeUndefined();
      expect(result[0].taskExpiredAt).toBeUndefined();
      expect(result[0].taskCooldown).toBeUndefined();
    });

    test('getReferrerClaimHistory: forwards the filter and maps claim documents', async () => {
      const doc = claims.seed({
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

      const result = await service.getReferrerClaimHistory({ filter: { referrerWallet: REFERRER_WALLET } });

      const call = claims.findAll.mock.calls[0];
      expect(call[0]).toEqual({ referrerWallet: REFERRER_WALLET });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(doc._id.toString());
      expect(result[0].amount).toBe('150');
      expect(result[0].referralWallet).toBe(USER_WALLET);
      expect(result[0].transactionHash).toBe(TRANSACTION_HASH);
      expect(result[0].logIndex).toBe(3);
      expect(result[0].blockNumber).toBe(99);
      expect(result[0]).not.toHaveProperty('_id');
      expect(JSON.parse(JSON.stringify(result[0]))).toEqual(result[0]);
    });

    test('getCommissionHistory: forwards the filter and maps history documents', async () => {
      const doc = commissions.seed({
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

      const result = await service.getCommissionHistory({ filter: { actionType: 'referral_reward' } });

      const call = commissions.findAll.mock.calls[0];
      expect(call[0]).toEqual({ actionType: 'referral_reward' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(doc._id.toString());
      expect(result[0].amount).toBe('7');
      expect(result[0].actionType).toBe('referral_reward');
      expect(result[0].userWallet).toBe(REFERRER_WALLET);
      expect(result[0].relatedUserWallet).toBe(USER_WALLET);
      expect(result[0].relatedUserId).toBe('user-1');
      expect(result[0]).not.toHaveProperty('_id');
      expect(JSON.parse(JSON.stringify(result[0]))).toEqual(result[0]);
    });

    test('list endpoints return empty arrays when nothing matches', async () => {
      expect(await service.getFees({})).toEqual([]);
      expect(await service.getReferrals({})).toEqual([]);
      expect(await service.getReferrerWithdraws({})).toEqual([]);
      expect(await service.getReferrerClaimHistory({})).toEqual([]);
      expect(await service.getCommissionHistory({})).toEqual([]);
    });
  });
});
