import { AppError } from '@shared/errors/app-errors';
import { ScannerStateEntity } from '../models/entity/scannerState.entity';
import type { IScannerStateEntity } from '../models/entity/scannerState.entity';
import type { FilterQuery, SortOrder } from 'mongoose';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';

export class ScannerStateRepository {
  constructor(private readonly model = ScannerStateEntity) {}

  @TraceDecorator()
  async create(data: Pick<IScannerStateEntity, 'chainId' | 'lastScannedBlock'>) {
    const doc = await this.model.create(data);
    return doc.toObject();
  }

  @TraceDecorator()
  async update(chainId: string, data: Pick<IScannerStateEntity, 'lastScannedBlock'>) {
    const doc = await this.model.findOneAndUpdate({ chainId }, data, { new: true }).lean();

    if (!doc) {
      throw new AppError({
        message: `ScannerState ${chainId} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    return doc;
  }

  @TraceDecorator()
  async delete(chainId: string) {
    const doc = await this.model.findOneAndDelete({ chainId }).lean();

    if (!doc) {
      throw new AppError({
        message: `ScannerState ${chainId} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    return chainId;
  }

  @TraceDecorator()
  async getLastScannedBlock(chainId: string): Promise<number> {
    const doc = await this.model.findOne({ chainId }).lean();
    return doc?.lastScannedBlock ?? 0;
  }

  @TraceDecorator()
  async updateLastScannedBlock(chainId: string, blockNumber: number): Promise<void> {
    const doc = await this.model.findOne({ chainId });

    if (doc) {
      await this.model.findOneAndUpdate({ chainId }, { lastScannedBlock: blockNumber }, { new: true }).lean();
    } else {
      await this.create({
        chainId,
        lastScannedBlock: blockNumber,
      });
    }
  }

  @TraceDecorator()
  async findAll(
    filters: FilterQuery<typeof this.model> = {},
    sort: { [key: string]: SortOrder } = { createdAt: 'asc' },
    limit: number = 100,
    offset: number = 0,
  ) {
    const docs = await this.model.find(filters).sort(sort).skip(offset).limit(limit).lean();

    return docs;
  }
}
