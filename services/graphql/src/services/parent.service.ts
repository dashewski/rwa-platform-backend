import type { RwaClient } from '../clients/eden.clients';

import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';
import { setSpanAttributes } from '@shared/monitoring/src/tracing';
import { AppError } from '@shared/errors/app-errors';

export class ParentService {
  constructor(private rwaClient: RwaClient) {}

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ type: a[0], parentId: a[1], userId: a[2] }),
  })
  public async getParentInfo(type: string, parentId: string, userId: string) {
    setSpanAttributes({
      entityType: type,
      entityId: parentId,
      userId,
    });
    let grandParentId: string;
    let ownerId: string;
    let ownerType: string;

    if (type === 'business') {
      const businessResponse = await this.rwaClient.getBusiness.post({
        id: parentId,
      });

      if (businessResponse.error) {
        throw new AppError({
          message: 'Failed to get business data',
          statusCode: 502,
          code: 'UPSTREAM_ERROR',
        });
      }

      const business = businessResponse.data;

      grandParentId = business.id;
      ownerId = business.ownerId;
      ownerType = business.ownerType;
    } else if (type === 'pool') {
      const poolResponse = await this.rwaClient.getPool.post({
        id: parentId,
      });

      if (poolResponse.error) {
        throw new AppError({
          message: 'Failed to get pool data',
          statusCode: 502,
          code: 'UPSTREAM_ERROR',
        });
      }

      const pool = poolResponse.data;

      grandParentId = pool.businessId;
      ownerId = pool.ownerId;
      ownerType = pool.ownerType;
    } else if (type == 'user') {
      if (parentId != userId) {
        throw new AppError({
          message: 'User type not equal parentId and userId',
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }
      grandParentId = parentId;
      ownerId = parentId;
      ownerType = 'user';
    } else {
      throw new AppError({
        message: 'Invalid parent type',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    return {
      grandParentId,
      ownerId,
      ownerType,
    };
  }
}
