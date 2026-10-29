import { createApp } from './app';
import { withTraceAsync } from '@shared/monitoring/src/tracing';

const app = await withTraceAsync('upload.init.main', async () => {
  return await createApp(
    String(process.env.REDIS_URL),
    String(process.env.JWT_SECRET),
    String(process.env.AUTH_SERVICE_URL),
    String(process.env.FILES_SERVICE_URL),
    String(process.env.DOCUMENTS_SERVICE_URL),
    String(process.env.GALLERY_SERVICE_URL),
    String(process.env.RWA_SERVICE_URL),
    String(process.env.COMPANY_SERVICE_URL),
    String(process.env.DOCUMENTS_ALLOWED_MIME_TYPES).split(',').filter(Boolean),
    String(process.env.GALLERY_ALLOWED_MIME_TYPES).split(',').filter(Boolean),
    String(process.env.TOKEN_IMAGE_ALLOWED_MIME_TYPES).split(',').filter(Boolean),
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
