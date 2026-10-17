import mongoose from 'mongoose';
import { errorChain } from '@shared/rabbitmq/src/reliability';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { ProcessedMessageEntity } from '../models/entity/processedMessage.entity';


export class ProcessedMessageRepository {
  constructor(private readonly model = ProcessedMessageEntity) {
    mongoose.set('transactionAsyncLocalStorage', true)
  }

  @TraceDecorator()
  async runOnce(key: string, handler: () => Promise<void>): Promise<boolean> {
    try {
      await mongoose.connection.transaction(async () => {
        await this.model.create({ key });
        await handler();
      });

      return true;
    } catch (error) {
      if (!errorChain(error).some((e) => e.code === 11000)) {
        throw error;
      }

      const processed = await this.model.exists({ key });
      if (processed) {
        return false;
      }

      throw error;
    }
  }
}
