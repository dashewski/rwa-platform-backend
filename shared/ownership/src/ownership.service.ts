import type { Redis } from 'ioredis';
import type { App as CompanyApp } from '@services/company/src';
import type { App as AuthApp } from '@services/auth/src';
import { createEdenTreatyClient } from '@shared/monitoring/src/eden';
import { AppError } from '@shared/errors/app-errors';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';
import { setSpanAttributes } from '@shared/monitoring/src/tracing';

type CompanyClient = ReturnType<typeof createEdenTreatyClient<CompanyApp>>;
type AuthClient = ReturnType<typeof createEdenTreatyClient<AuthApp>>;
type Company = NonNullable<Awaited<ReturnType<CompanyClient['getCompany']['post']>>['data']>;


export class OwnershipService {
  constructor(
    private readonly redis: Redis,
    private readonly companyClient: CompanyClient,
    private readonly authClient: AuthClient,
  ) {}

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ userId: a[0].userId, ownerId: a[0].ownerId, ownerType: a[0].ownerType }),
  })
  async checkOwnership(params: {
    userId: string;
    ownerId: string;
    ownerType: string;
    permission: 'content' | 'deploy';
    entityId?: string;
  }): Promise<void> {
    setSpanAttributes({
      userId: params.userId,
      entityType: params.ownerType,
      ...(params.entityId !== undefined && { entityId: params.entityId }),
    });
    const { userId, ownerId, ownerType, permission, entityId = '*' } = params;

    if (ownerType === 'user') {
      if (ownerId !== userId) {
        throw new AppError({
          message: 'User does not have permission',
          statusCode: 403,
          code: 'FORBIDDEN',
        });
      }
    } else if (ownerType === 'company') {
      const company = await this.getCompany({ id: ownerId });

      let hasPermission: boolean;
      if (userId === company.ownerId) {
        hasPermission = true;
      } else {
        const user = company.users.find((u) => u.userId === userId);
        if (!user) {
          hasPermission = false;
        } else {
          hasPermission = user.permissions.some(
            (p) => p.permission === permission && (p.entity === '*' || p.entity === entityId),
          );
        }
      }

      if (!hasPermission) {
        throw new AppError({
          message: 'User does not have required company permissions',
          statusCode: 403,
          code: 'FORBIDDEN',
        });
      }
    } else {
      throw new AppError({ message: 'Invalid owner type', statusCode: 403, code: 'FORBIDDEN' });
    }
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ userId: a[0].user.id, ownerId: a[0].ownerId, ownerType: a[0].ownerType }),
  })
  async getOwnerWallet(params: { user: { id: string; wallet: string }; ownerId: string; ownerType: string }): Promise<string> {
    setSpanAttributes({
      userId: params.user.id,
      wallet: params.user.wallet,
      entityType: params.ownerType,
    });
    const { user, ownerId, ownerType } = params;

    if (ownerType === 'user') {
      return user.wallet;
    }

    if (ownerType === 'company') {
      const company = await this.getCompany({ id: ownerId });

      const ownerResponse = await this.authClient.getUser.post({
        userId: company.ownerId,
      });
      if (ownerResponse.error || !ownerResponse.data) {
        throw new AppError({
          message: 'Failed to get company owner data',
          statusCode: 403,
          code: 'FORBIDDEN',
        });
      }

      return ownerResponse.data.wallet;
    }

    throw new AppError({
      message: 'Invalid owner type',
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ companyId: a[0] }),
  })
  async resetCompanyCache(companyId: string) {
    setSpanAttributes({ entityId: companyId });
    await this.redis.del(this.getCompanyCacheKey(companyId));
  }

  private getCompanyCacheKey(companyId: string) {
    return `company:${companyId}`;
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ companyId: a[0].id }),
  })
  async getCompany(params: { id: string }): Promise<Company> {
    setSpanAttributes({ entityId: params.id });

    const cacheKey = this.getCompanyCacheKey(params.id);

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const response = await this.companyClient.getCompany.post(params);

    if (response.error || !response.data) {
      throw new AppError({ message: 'Failed to get company data', statusCode: 502, code: 'UPSTREAM_ERROR' });
    }

    await this.redis.setex(cacheKey, 300, JSON.stringify(response.data));

    return response.data;
  }
}
