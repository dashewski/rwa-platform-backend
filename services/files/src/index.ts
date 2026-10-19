import { createApp } from './app';
import { withTraceAsync } from '@shared/monitoring/src/tracing';

const app = await withTraceAsync('files.init.main', async () => {
  return await createApp(
    String(process.env.MONGODB_URI) + '/' + String(process.env.MONGODB_DBNAME),
    String(process.env.STORAGE_ROOT_DIR),
    Number(process.env.MAX_FILE_SIZE),
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
