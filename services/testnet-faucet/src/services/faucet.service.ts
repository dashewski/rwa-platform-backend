import { AppError } from '@shared/errors/app-errors';
import { FaucetRequestRepository } from '../repositories/faucetRequest.repository';
import { FaucetCooldownRepository } from '../repositories/faucetCooldown.repository';
import type { FaucetTokenType } from '../models/shared/enums.model';
import { BlockchainClient } from '../clients/blockchain.client';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';
import { setSpanAttributes } from '@shared/monitoring/src/tracing';

export class FaucetService {
  constructor(
    private readonly faucetRequestRepository: FaucetRequestRepository,
    private readonly faucetCooldownRepository: FaucetCooldownRepository,
    private readonly blockchainClient: BlockchainClient,
    private readonly holdTokenAddress: string,
    private readonly platformTokenAddress: string,
    private readonly gasTokenAmount: number,
    private readonly holdTokenAmount: number,
    private readonly platformTokenAmount: number,
    private readonly requestGasDelaySec: number,
    private readonly requestHoldDelaySec: number,
    private readonly requestPlatformDelaySec: number,
  ) {}

  /**
   * Gets request history for a user with pagination
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ userId: a[0].userId, wallet: a[0].wallet, amount: a[0].amount }),
  })
  async getRequestHistory(data: { userId: string; limit?: number; offset?: number }) {
    setSpanAttributes({ userId: data.userId });
    const { userId, limit = 50, offset = 0 } = data;

    if (limit > 100) {
      throw new AppError({
        message: 'Limit cannot exceed 100',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    if (offset < 0) {
      throw new AppError({
        message: 'Offset cannot be negative',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    const results = await this.faucetRequestRepository.findAll(
      { userId },
      { limit, offset, sort: { createdAt: 'asc' } },
    );

    return results.map((result) => ({
      id: result._id.toString(),
      userId: result.userId,
      wallet: result.wallet,
      tokenType: result.tokenType,
      amount: result.amount,
      transactionHash: result.transactionHash,
      createdAt: (result as any).createdAt as number,
    }));
  }

  /**
   * Gets unlock time for next token requests
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ userId: a[0].userId, wallet: a[0].wallet, amount: a[0].amount }),
  })
  async getTokenUnlockTime(data: { userId: string }) {
    setSpanAttributes({ userId: data.userId });
    const [gasUnlockTime, holdUnlockTime, platformUnlockTime] = await Promise.all([
      this.faucetCooldownRepository.findUnlockAt(this.cooldownKey(data.userId, 'gas')),
      this.faucetCooldownRepository.findUnlockAt(this.cooldownKey(data.userId, 'hold')),
      this.faucetCooldownRepository.findUnlockAt(this.cooldownKey(data.userId, 'platform')),
    ]);

    return {
      gasUnlockTime: gasUnlockTime ?? 0,
      holdUnlockTime: holdUnlockTime ?? 0,
      platformUnlockTime: platformUnlockTime ?? 0,
    };
  }

  /**
   * Requests gas tokens to be sent to a wallet
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ userId: a[0].userId, wallet: a[0].wallet, amount: a[0].amount }),
  })
  async requestGasToken(data: { userId: string; wallet: string; amount: number }) {
    setSpanAttributes({
      userId: data.userId,
      wallet: data.wallet,
      tokenType: 'gas',
      amount: data.amount,
    });
    const transferAmount = data.amount > this.gasTokenAmount ? this.gasTokenAmount : data.amount;

    return this.runWithCooldown(this.cooldownKey(data.userId, 'gas'), this.requestGasDelaySec, async () => {
      // Use configured gas amount
      const txHash = await this.blockchainClient.transferToken(data.wallet, `${transferAmount}`);

      const result = await this.faucetRequestRepository.create({
        userId: data.userId,
        wallet: data.wallet,
        tokenType: 'gas',
        amount: transferAmount,
        transactionHash: txHash,
      });

      return {
        id: result._id.toString(),
        userId: result.userId,
        wallet: result.wallet,
        tokenType: result.tokenType,
        amount: result.amount,
        transactionHash: result.transactionHash,
        createdAt: (result as any).createdAt as number,
      };
    });
  }

  /**
   * Requests HOLD tokens to be sent to a wallet
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ userId: a[0].userId, wallet: a[0].wallet, amount: a[0].amount }),
  })
  async requestHoldToken(data: { userId: string; wallet: string; amount: number }) {
    setSpanAttributes({
      userId: data.userId,
      wallet: data.wallet,
      tokenType: 'hold',
      amount: data.amount,
    });
    const transferAmount = data.amount > this.holdTokenAmount ? this.holdTokenAmount : data.amount;

    return this.runWithCooldown(this.cooldownKey(data.userId, 'hold'), this.requestHoldDelaySec, async () => {
      // Use configured hold token address and amount
      const txHash = await this.blockchainClient.transferERC20Token(
        this.holdTokenAddress,
        data.wallet,
        `${transferAmount}`,
      );

      const result = await this.faucetRequestRepository.create({
        userId: data.userId,
        wallet: data.wallet,
        tokenType: 'hold',
        amount: transferAmount,
        transactionHash: txHash,
      });

      return {
        id: result._id.toString(),
        userId: result.userId,
        wallet: result.wallet,
        tokenType: result.tokenType,
        amount: result.amount,
        transactionHash: result.transactionHash,
        createdAt: (result as any).createdAt as number,
      };
    });
  }

  /**
   * Requests PLATFORM tokens to be sent to a wallet
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ userId: a[0].userId, wallet: a[0].wallet, amount: a[0].amount }),
  })
  async requestPlatformToken(data: { userId: string; wallet: string; amount: number }) {
    setSpanAttributes({
      userId: data.userId,
      wallet: data.wallet,
      tokenType: 'platform',
      amount: data.amount,
    });
    const transferAmount = data.amount > this.platformTokenAmount ? this.platformTokenAmount : data.amount;

    return this.runWithCooldown(this.cooldownKey(data.userId, 'platform'), this.requestPlatformDelaySec, async () => {
      // Use configured platform token address and amount
      const txHash = await this.blockchainClient.transferERC20Token(
        this.platformTokenAddress,
        data.wallet,
        `${transferAmount}`,
      );

      const result = await this.faucetRequestRepository.create({
        userId: data.userId,
        wallet: data.wallet,
        tokenType: 'platform',
        amount: transferAmount,
        transactionHash: txHash,
      });

      return {
        id: result._id.toString(),
        userId: result.userId,
        wallet: result.wallet,
        tokenType: result.tokenType,
        amount: result.amount,
        transactionHash: result.transactionHash,
        createdAt: (result as any).createdAt as number,
      };
    });
  }

  private cooldownKey(userId: string, tokenType: FaucetTokenType) {
    return `${userId}:${tokenType}`;
  }

  private async runWithCooldown<T>(key: string, delaySec: number, action: () => Promise<T>) {
    const now = Math.floor(Date.now() / 1000);
    const claim = await this.faucetCooldownRepository.claim({ key, now, unlockAt: now + delaySec });

    if (!claim.claimed) {
      throw new AppError({
        message: `Token request is locked for ${claim.unlockAt - now} seconds`,
        statusCode: 429,
        code: 'LIMIT_EXCEEDED',
      });
    }

    try {
      return await action();
    } catch (error) {
      await this.faucetCooldownRepository.release({ key, previousUnlockAt: claim.previousUnlockAt });
      throw error;
    }
  }
}
