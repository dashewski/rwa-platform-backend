import { Elysia } from 'elysia';
import { InboxConsumerService } from '@shared/inbox-consumer';
import { ChartsService } from '../services/charts.service';
import { TransactionsService } from '../services/transactions.service';
import type { RepositoriesPlugin } from './repositories.plugin';
import type { ClientsPlugin } from './clients.plugin';
import { withTraceSync } from '@shared/monitoring/src/tracing';

export const createServicesPlugin = (repositoriesPlugin: RepositoriesPlugin, clientsPlugin: ClientsPlugin) => {
  const chartsService = withTraceSync(
    'charts.init.services.charts',
    () =>
      new ChartsService(repositoriesPlugin.decorator.priceDataRepository, clientsPlugin.decorator.chartEventsClient),
  );

  const transactionsService = withTraceSync(
    'charts.init.services.transactions',
    () =>
      new TransactionsService(
        repositoriesPlugin.decorator.poolTransactionRepository,
        clientsPlugin.decorator.chartEventsClient,
      ),
  );

  const inboxConsumerService = withTraceSync(
    'charts.init.services.inbox_consumer',
    () => new InboxConsumerService(repositoriesPlugin.decorator.inboxConsumerMessageRepository),
  );

  const plugin = withTraceSync('charts.init.services.plugin', () =>
    new Elysia({ name: 'Services' })
      .use(repositoriesPlugin)
      .use(clientsPlugin)
      .decorate('chartsService', chartsService)
      .decorate('transactionsService', transactionsService)
      .decorate('inboxConsumerService', inboxConsumerService),
  );

  return plugin;
};

export type ServicesPlugin = ReturnType<typeof createServicesPlugin>;
