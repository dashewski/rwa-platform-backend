import { SignatureRepository } from '../repositories/signature.repository';
import { SignatureTaskRepository } from '../repositories/signatureTask.repository';
import type { OutboxPublisherService } from '@shared/outbox-publisher';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';
import { setSpanAttributes } from '@shared/monitoring/src/tracing';
import { AppError } from '@shared/errors/app-errors';
import { ethers } from 'ethers';
import mongoose from 'mongoose';

export class SignaturesService {
  constructor(
    private readonly signatureRepository: SignatureRepository,
    private readonly signatureTaskRepository: SignatureTaskRepository,
    private readonly outboxPublisher: OutboxPublisherService,
  ) {
    mongoose.set('transactionAsyncLocalStorage', true);
  }

  /**
   * Creates a new signatures task
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      ownerId: a[0].ownerId,
      ownerType: a[0].ownerType,
      hash: a[0].hash,
      requiredSignatures: a[0].requiredSignatures,
      expired: a[0].expired,
    }),
  })
  async createTask(data: {
    ownerId: string;
    ownerType: string;
    hash: string;
    requiredSignatures: number;
    expired: number;
  }) {
    setSpanAttributes({
      entityId: data.ownerId,
      entityType: data.ownerType,
      hash: data.hash,
    });

    // Derive the final message hash here, on the manager: the contract verifies
    // signatures over keccak(innerHash ++ expired) (Factory.sol, ReferralTreasury.sol).
    // The task is identified by this final hash (unique index on `hash`), so a retry
    // with a fresh expiry naturally gets a new task, while an identical repeat within
    // the same expiry window is rejected as a duplicate.
    const finalHash = ethers.solidityPackedKeccak256(['bytes32', 'uint256'], [data.hash, data.expired]);

    let taskId = '';

    await mongoose.connection.transaction(async () => {
      const task = await this.signatureTaskRepository.create({
        ...data,
        hash: finalHash,
      });

      taskId = task._id.toString();

      // Send signature request to signers
      await this.outboxPublisher.publish(
        'sign.exchange',
        'task',
        {
          hash: finalHash,
          taskId,
          expired: data.expired,
        },
        taskId,
      );
    });

    const task = await this.signatureTaskRepository.findById(taskId);

    return {
      id: task._id.toString(),
      ownerId: task.ownerId,
      ownerType: task.ownerType,
      hash: task.hash,
      requiredSignatures: task.requiredSignatures,
      expired: task.expired,
      completed: task.completed,
    };
  }


  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ taskId: a[0]?.taskId, signer: a[0]?.signer }),
  })
  async addSignature(data: { taskId: string; signer: string; signature: string }) {
    setSpanAttributes({
      taskId: data.taskId,
      signer: data.signer,
    });
    // Verify task exists and not completed
    const task = await this.signatureTaskRepository.findById(data.taskId);
    if (task.completed) {
      throw new AppError({ message: 'Task already completed', statusCode: 409, code: 'CONFLICT' });
    }
    if (task.expired && task.expired < Math.floor(Date.now() / 1000)) {
      throw new AppError({ message: 'Task expired', statusCode: 410, code: 'EXPIRED' });
    }

    // Add signature
    const signature = await this.signatureRepository.create({
      taskId: data.taskId,
      signer: data.signer,
      signature: data.signature,
    });

    // Check if we have enough signatures
    const signaturesCount = await this.signatureRepository.countByTaskId(data.taskId);
    const isCompleted = signaturesCount >= task.requiredSignatures;

    // Update task status if completed
    if (isCompleted) {
      await this.signatureTaskRepository.update(data.taskId, {
        completed: true,
      });
    }

    return {
      signature: {
        id: signature._id.toString(),
        taskId: signature.taskId,
        signer: signature.signer,
        signature: signature.signature,
      },
      isCompleted,
    };
  }

  /**
   * Gets task with its signatures
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ taskId: a[0] }),
  })
  async getSignatureTask(taskId: string) {
    setSpanAttributes({
      taskId: taskId,
    });
    const task = await this.signatureTaskRepository.findById(taskId);

    let signatures = task.completed ? await this.signatureRepository.findByTaskId(taskId) : undefined;

    return {
      id: task._id.toString(),
      ownerId: task.ownerId,
      ownerType: task.ownerType,
      hash: task.hash,
      requiredSignatures: task.requiredSignatures,
      expired: task.expired,
      completed: task.completed,
      signatures: signatures?.map((sig) => ({
        signer: sig.signer,
        signature: sig.signature,
      })),
    };
  }
}
