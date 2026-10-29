import { Elysia } from 'elysia';
import { yogaServer } from './graphql/server';
import { monitoringPlugin, logger } from '@shared/monitoring/src/monitoring.plugin';
import { healthPlugin } from '@shared/monitoring/src/health.plugin';

const port = Number(process.env.PORT);

new Elysia({
  serve: {
    idleTimeout: 30,
  },
})
  .use(monitoringPlugin)
  .use(healthPlugin)
  .state('startTime', 0 as number)
  .all('/graphql', (context) => yogaServer.handle(context.request))
  .all('/graphql/stream', (context) => yogaServer.handle(context.request))
  .listen(port);

logger.info(`Server is running on http://localhost:${port}/`);
