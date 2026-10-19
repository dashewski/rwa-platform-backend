import { createApp } from './app';
import { withTraceAsync } from '@shared/monitoring/src/tracing';
import { buildFilesBaseUrl } from '@shared/files/src/index';

const app = await withTraceAsync('gallery.init.main', async () => {
  return await createApp(
    String(process.env.MONGODB_URI) + '/' + String(process.env.MONGODB_DBNAME),
    buildFilesBaseUrl(String(process.env.BASE_DOMAIN), String(process.env.FILES_URL_PATH)),
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
