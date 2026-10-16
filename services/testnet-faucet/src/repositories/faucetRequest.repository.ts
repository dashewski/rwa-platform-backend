import { FaucetRequestEntity } from '../models/entity/faucet.entity';
import type { FaucetTokenType } from '../models/shared/enums.model';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';

export class FaucetRequestRepository {
  @TraceDecorator()
  async create(data: {
    userId: string;
    wallet: string;
    tokenType: FaucetTokenType;
    amount: number;
    transactionHash: string;
  }) {
    const request = await FaucetRequestEntity.create(data);
    return request.toObject();
  }

  @TraceDecorator()
  async findById(id: string) {
    const request = await FaucetRequestEntity.findById(id);
    return request?.toObject();
  }

  @TraceDecorator()
  async findAll(
    filter: {
      userId?: string;
      wallet?: string;
      tokenType?: FaucetTokenType;
    },
    options: {
      limit?: number;
      offset?: number;
      sort?: Record<string, 'asc' | 'desc'>;
    } = {},
  ) {
    const { limit = 50, offset = 0, sort = { createdAt: 'asc' } } = options;

    const requests = await FaucetRequestEntity.find(filter).sort(sort).skip(offset).limit(limit).lean();

    return requests;
  }
}
