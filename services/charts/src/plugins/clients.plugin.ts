import { Elysia } from 'elysia';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { RedisEventsClient } from '@shared/redis-events/src/redis-events.client';
import { ChartEventsClient } from '../clients/redis.client';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createClientsPlugin = async (redisUrl: string, serviceName: string) => {
  const redisEventsClient = withTraceSync(
    'charts.init.clients.redis_events',
    () => new RedisEventsClient(redisUrl, serviceName),
  );

  const chartEventsClient = withTraceSync(
    'charts.init.clients.chart_events',
    () => new ChartEventsClient(redisEventsClient),
  );

  const plugin = withTraceSync('charts.init.clients.plugin', () =>
    new Elysia({ name: 'Clients' })
      .decorate('redisEventsClient', redisEventsClient)
      .decorate('chartEventsClient', chartEventsClient)
      .onStop(async () => {
        await withTraceAsync('charts.stop.clients', async () => {
          logger.debug('Stopping clients');
          await redisEventsClient.close();
        });
      }),
  );

  return plugin;
};

export type ClientsPlugin = Awaited<ReturnType<typeof createClientsPlugin>>;
