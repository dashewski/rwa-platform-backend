import mongoose, { Schema } from 'mongoose';
import type { Model } from 'mongoose';
import { errorChain } from '@shared/rabbitmq/src/reliability';

/**
 * Exactly-once processing of blockchain events.
 *
 * The transport only guarantees "at-least-once": a message can be delivered
 * again (lost ack, consumer restart, scanner re-publish, daemon retries...).
 * To get "exactly-once" processing, every event is applied inside a single
 * Mongo transaction together with a unique processed-events marker:
 *
 *   1. insert the marker (chainId + transactionHash + logIndex, unique index);
 *   2. run the handler - every DB operation inside joins the transaction;
 *   3. commit; only then acknowledge the message.
 *
 * Requires MongoDB to run as a replica set (multi-document transactions).
 */

mongoose.set('transactionAsyncLocalStorage', true);

const PROCESSED_EVENT_MODEL_NAME = 'ProcessedEvent';

const processedEventSchema = new Schema(
  {
    chainId: { type: Number, required: true },
    transactionHash: { type: String, required: true },
    logIndex: { type: Number, required: true },
    name: { type: String },
    processedAt: { type: Date, default: () => new Date() },
  },
  { collection: 'processed_events', versionKey: false },
);

processedEventSchema.index({ chainId: 1, transactionHash: 1, logIndex: 1 }, { unique: true });

function getProcessedEventModel(): Model<any> {
  return (
    (mongoose.models[PROCESSED_EVENT_MODEL_NAME] as Model<any>) ??
    mongoose.model(PROCESSED_EVENT_MODEL_NAME, processedEventSchema)
  );
}

export interface ProcessableEvent {
  chainId: number;
  transactionHash: string;
  logIndex: number;
  name?: string;
}

export function isDuplicateKeyError(error: unknown): boolean {
  return errorChain(error).some((e) => e.code === 11000);
}

/**
 * The old implementation classified *any* duplicate-key error with
 * transactionHash/logIndex as "duplicate delivery". That is unsafe when the
 * handler itself has a unique index using the same business key.
 *
 * After rollback, verify the committed processed-events marker. Only a real
 * marker means the event was already successfully accepted by another worker.
 */
export async function processEventExactlyOnce(
  event: ProcessableEvent,
  handler: () => Promise<void>,
): Promise<boolean> {
  try {
    await mongoose.connection.transaction(async () => {
      await getProcessedEventModel().create({
        chainId: event.chainId,
        transactionHash: event.transactionHash,
        logIndex: event.logIndex,
        name: event.name,
      });

      await handler();
    });

    return true;
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    // The transaction is already rolled back here. If the marker does not
    // exist, this duplicate key came from the handler or another collection
    // and the message must be retried rather than acknowledged as processed.
    const processedEvent = await getProcessedEventModel().exists({
      chainId: event.chainId,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
    });

    if (processedEvent) {
      return false;
    }

    throw error;
  }
}
