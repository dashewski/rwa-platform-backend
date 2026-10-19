import { createApp } from './app';
import { withTraceAsync } from '@shared/monitoring/src/tracing';

const app = await withTraceAsync('ai-assistant.init.main', async () => {
  return await createApp(
    String(process.env.MONGODB_URI) + '/' + String(process.env.MONGODB_DBNAME),
    String(process.env.OPENROUTER_API_KEY),
    String(process.env.OPENROUTER_BASE_URL),
    String(process.env.OPENROUTER_MODEL),
    String(process.env.RWA_SERVICE_URL),
    String(process.env.PORTFOLIO_SERVICE_URL),
  );
});

app.listen(Number(process.env.PORT));

const shutdown = async () => {
  try {
    await app.stop();
    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export type App = typeof app;
