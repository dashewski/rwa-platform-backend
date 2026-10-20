import { createApp } from './app';
import { withTraceAsync } from '@shared/monitoring/src/tracing';
import { buildFilesBaseUrl } from '@shared/files/src/index';

const app = await withTraceAsync('rwa.init.main', async () => {
  return await createApp(
    String(process.env.MONGODB_URI) + '/' + String(process.env.MONGODB_DBNAME),
    String(process.env.REDIS_URL),
    String(process.env.SERVICE_NAME),
    String(process.env.OPENROUTER_API_KEY),
    String(process.env.OPENROUTER_BASE_URL),
    String(process.env.OPENROUTER_MODEL),
    String(process.env.RABBITMQ_URL),
    String(process.env.SIGNERS_MANAGER_URL),
    [
      {
        chainId: '97',
        name: 'BSC Testnet',
        factoryAddress: '0xF46A71cac8B1A8F734559Cc4367CD1546A1A29bF',
      },
    ],
    `https://${String(process.env.BASE_DOMAIN)}${String(process.env.PLACEHOLDER_IMAGE_PATH)}`,
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
