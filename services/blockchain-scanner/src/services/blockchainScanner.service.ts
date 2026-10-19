import { AppError } from '@shared/errors/app-errors';
import { EventRepository } from '../repositories/event.repository';
import { ScannerStateRepository } from '../repositories/scannerState.repository';
import type { OutboxPublisherService } from '@shared/outbox-publisher';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';
import { metrics } from '@shared/monitoring/src/metrics';
import { setSpanAttributes } from '@shared/monitoring/src/tracing';

/**
 * Service for handling blockchain events
 */

export class BlockchainScannerService {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly scannerStateRepository: ScannerStateRepository,
    private readonly outboxPublisher: OutboxPublisherService,
    private readonly exchange: string,
    private readonly chainId: string,
  ) {}

  /**
   * Get event by ID
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ id: a[0] }),
  })
  async getEventById(id: string) {
    setSpanAttributes({
      entityId: id,
      entityType: 'blockchain_event',
    });
    const event = await this.eventRepository.findById(id);
    if (!event) {
      throw new AppError({
        message: `Event with id ${id} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    return {
      id: event._id.toString(),
      chainId: event.chainId,
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
      address: event.address,
      name: event.name,
      data: event.data,
      timestamp: event.timestamp,
    };
  }

  /**
   * Get events by filters
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator()
  async getEvents(
    filters: {
      chainId?: number;
      blockNumber?: number;
      transactionHash?: string;
      address?: string;
      name?: string;
    },
    pagination?: { limit?: number; offset?: number },
  ) {
    setSpanAttributes({
      entityType: 'blockchain_event',
      ...(filters.chainId !== undefined && { chainId: filters.chainId }),
      ...(filters.blockNumber !== undefined && { blockNumber: filters.blockNumber }),
      ...(filters.transactionHash !== undefined && {
        transactionHash: filters.transactionHash,
      }),
      ...(filters.name !== undefined && { eventName: filters.name }),
    });
    const events = await this.eventRepository.findAll(
      filters,
      { blockNumber: -1, logIndex: -1 },
      pagination?.limit || 100,
      pagination?.offset || 0,
    );

    return events.map((event) => ({
      id: event._id.toString(),
      chainId: event.chainId,
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
      address: event.address,
      name: event.name,
      data: event.data,
      timestamp: event.timestamp,
    }));
  }

  /**
   * Apply blockchain events from a single block - save to DB and queue them for delivery
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ blockNumber: a[0] }),
  })
  async applyBlockEvents(
    blockNumber: number,
    events: Array<{
      chainId: string;
      name: string;
      blockNumber: number;
      transactionHash: string;
      address: string;
      logIndex: number;
      data: Record<string, any>;
      timestamp: number;
    }>,
  ): Promise<void> {
    setSpanAttributes({
      blockNumber,
      batchSize: events.length,
      ...(events.length > 0 && { chainId: events[0].chainId }),
      ...(events.length > 0 && { eventName: events[0].name }),
    });
    if (events.length) {
      for (let i = 0; i < events.length; i++) {
        if (events[i].blockNumber !== blockNumber) {
          throw new AppError({
            message: 'applyBlockEvents blockNumber!',
            statusCode: 502,
            code: 'BLOCKCHAIN_ERROR',
          });
        }
      }

      // Delete existing events for this block
      await this.eventRepository.deleteBlockEvents(this.chainId, blockNumber);

      // Save new events to database
      const savedEvents = await this.eventRepository.createEvents(events);

      for (const event of savedEvents) {
        // chain-stable messageId: a re-scanned block yields the same id and the
        // consumer inbox turns the duplicate delivery into a no-op
        await this.outboxPublisher.publish(
          this.exchange,
          event.name,
          event,
          `${this.chainId}:${event.transactionHash}:${event.logIndex}`,
        );
        metrics.counter('events_processed_total', {
          event_name: event.name,
          chain_id: String(this.chainId),
        });
      }
    }

    // Update scanner state only after every event of the block is queued
    await this.scannerStateRepository.updateLastScannedBlock(this.chainId, blockNumber);
  }

  /**
   * Get last processed block number from database
   * Returns 0 if no blocks were processed yet
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator()
  async getLastProcessedBlock(): Promise<number> {
    setSpanAttributes({ chainId: this.chainId });
    return this.scannerStateRepository.getLastScannedBlock(this.chainId);
  }

  /**
   * Update last processed block number in database
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ blockNumber: a[0] }),
  })
  async updateLastProcessedBlock(blockNumber: number): Promise<void> {
    setSpanAttributes({
      blockNumber,
      chainId: this.chainId,
    });
    await this.scannerStateRepository.updateLastScannedBlock(this.chainId, blockNumber);
  }
}
