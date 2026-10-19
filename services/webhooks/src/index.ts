import { createApp } from './app';
import { withTraceAsync } from '@shared/monitoring/src/tracing';

const app = await withTraceAsync('webhooks.init.main', async () => {
  return await createApp(
    String(process.env.MONGODB_URI) + '/' + String(process.env.MONGODB_DBNAME),
    String(process.env.RABBITMQ_URL),
    String(process.env.REDIS_URL),
    String(process.env.WEBHOOKS_ENCRYPTION_KEY),
  );
});

app.listen(Number(process.env.PORT));

const shutdown = async () => {
  try {
    await app.stop();
    process.exit(0);
  } catch {
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export type App = typeof app;
