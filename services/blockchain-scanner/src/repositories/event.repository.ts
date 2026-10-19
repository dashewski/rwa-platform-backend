import { EventEntity } from '../models/entity/event.entity';
import type { IEventEntity } from '../models/entity/event.entity';
import type { FilterQuery, SortOrder } from 'mongoose';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';

export class EventRepository {
  constructor(private readonly model = EventEntity) {}

  /**
   * Find event by ID
   */
  @TraceDecorator()
  async findById(id: string) {
    return await this.model.findById(id).lean();
  }

  /**
   * Save multiple events to database
   */
  @TraceDecorator()
  async createEvents(
    data: Pick<
      IEventEntity,
      'chainId' | 'blockNumber' | 'transactionHash' | 'logIndex' | 'address' | 'name' | 'data' | 'timestamp'
    >[],
  ) {
    if (data.length === 0) return [];

    const docs = await this.model.insertMany(data, { ordered: true, lean: true });

    return docs;
  }

  /**
   * Delete all events for a specific block
   */
  @TraceDecorator()
  async deleteBlockEvents(chainId: string, blockNumber: number) {
    const result = await this.model.deleteMany({
      chainId,
      blockNumber,
    });

    const deletedCount = result.deletedCount;
    return deletedCount;
  }

  @TraceDecorator()
  async findAll(
    filters: FilterQuery<typeof this.model> = {},
    sort: { [key: string]: SortOrder } = { blockNumber: -1, logIndex: -1 },
    limit: number = 100,
    offset: number = 0,
  ) {
    return await this.model.find(filters).sort(sort).skip(offset).limit(limit).lean();
  }
}
