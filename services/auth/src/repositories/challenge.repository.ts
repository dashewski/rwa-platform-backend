import { ChallengeEntity } from '../models/entity/challenge.entity';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';

export class ChallengeRepository {
  constructor(private readonly model = ChallengeEntity) {}

  @TraceDecorator()
  async create(data: { nonce: string; wallet: string; expiresAt: number }) {
    const doc = await this.model.create(data);

    return doc.toObject();
  }

  @TraceDecorator()
  async consume(nonce: string) {
    return await this.model.findOneAndDelete({ nonce }).lean();
  }
}
