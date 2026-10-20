import { ethers, Wallet } from 'ethers';
import mongoose from 'mongoose';
import type { OutboxPublisherService } from '@shared/outbox-publisher';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';
import { setSpanAttributes } from '@shared/monitoring/src/tracing';
import { AppError } from '@shared/errors/app-errors';

/**
 * Service for handling digital signatures
 */

export class SignatureService {
  private readonly wallet: Wallet;

  constructor(
    private readonly outboxPublisher: OutboxPublisherService,
    privateKey: string,
  ) {
    mongoose.set('transactionAsyncLocalStorage', true);
    this.wallet = new Wallet(privateKey);
  }

  /**
   * Sign hash with private key and send result back
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ hash: a[0].hash, taskId: a[0].taskId, expired: a[0].expired }),
  })
  async signHash(task: { hash: string; taskId: string; expired: number }, commitInbox: () => Promise<void>) {
    const { hash, taskId, expired } = task;

    setSpanAttributes({
      wallet: this.wallet.address,
      hash,
      taskId,
      expired,
    });

    const now = Math.floor(Date.now() / 1000);
    if (expired < now) {
      throw new AppError({ message: 'Task expired', statusCode: 410, code: 'EXPIRED' });
    }

    // The manager derives the final message hash (keccak(innerHash ++ expired)) to match
    // the contracts (Factory.sol, ReferralTreasury.sol). Sign exactly what was received.
    const signer = this.wallet.address;
    const signature = await this.wallet.signMessage(ethers.getBytes(hash));

    await mongoose.connection.transaction(async () => {
      await this.outboxPublisher.publish(
        'sign.exchange',
        'response',
        { taskId, signer, hash, signature },
        `${taskId}:${signer}`,
      );

      await commitInbox();
    });

    return { signer, signature };
  }

  /**
   * Get signer's public address
   */
  getSignerAddress(): string {
    return this.wallet.address;
  }
}
