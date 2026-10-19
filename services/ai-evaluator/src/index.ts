import { createApp } from './app';
import { withTraceAsync } from '@shared/monitoring/src/tracing';

const app = await withTraceAsync('ai-evaluator.init.main', async () => {
  return await createApp(
    String(process.env.MONGODB_URI) + '/' + String(process.env.MONGODB_DBNAME),
    String(process.env.OPENROUTER_API_KEY),
    String(process.env.OPENROUTER_BASE_URL),
    String(process.env.OPENROUTER_MODEL),
    String(process.env.RWA_SERVICE_URL),
    String(process.env.DOCUMENTS_SERVICE_URL),
    String(process.env.GALLERY_SERVICE_URL),
    String(process.env.REACTIONS_SERVICE_URL),
    String(process.env.QUESTIONS_SERVICE_URL),
    String(process.env.PORTFOLIO_SERVICE_URL),
    String(process.env.RABBITMQ_URL),
    Number(process.env.AI_EVALUATOR_MAX_FILES_PER_REQUEST) || 20,
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
