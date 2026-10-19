import { Elysia } from 'elysia';
import { InboxConsumerService } from '@shared/inbox-consumer';
import { PortfolioService } from '../services/portfolio.service';
import type { RepositoriesPlugin } from './repositories.plugin';
import { withTraceSync } from '@shared/monitoring/src/tracing';

export const createServicesPlugin = (repositoriesPlugin: RepositoriesPlugin) => {
  const portfolioService = withTraceSync(
    'portfolio.init.services.portfolio',
    () =>
      new PortfolioService(
        repositoriesPlugin.decorator.tokenBalanceRepository,
        repositoriesPlugin.decorator.transactionRepository,
      ),
  );

  const inboxConsumer = withTraceSync('portfolio.init.services.inbox_consumer', () =>
    new InboxConsumerService(
      repositoriesPlugin.decorator.inboxConsumerMessageRepository,
    ),
  );

  const plugin = withTraceSync('portfolio.init.services.plugin', () =>
    new Elysia({ name: 'Services' })
      .use(repositoriesPlugin)
      .decorate('portfolioService', portfolioService)
      .decorate('inboxConsumer', inboxConsumer),
  );

  return plugin;
};

export type ServicesPlugin = ReturnType<typeof createServicesPlugin>;
