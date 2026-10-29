import { createApp } from './app';
import { withTraceAsync } from '@shared/monitoring/src/tracing';

const app = await withTraceAsync('blockchain-scanner.init.main', async () => {
  return await createApp(
    String(process.env.MONGODB_URI) + '/' + String(process.env.MONGODB_DBNAME),
    String(process.env.RABBITMQ_URL),
    String(process.env.RPC_URL),
    String(process.env.EVENT_EMITTER_ADDRESS),
    Number(process.env.BLOCK_CONFIRMATIONS),
    Number(process.env.SCAN_INTERVAL),
    Number(process.env.BATCH_SIZE),
    String(process.env.CHAIN_ID),
    Number(process.env.INIT_SCAN_BLOCK_NUMBER),
    String(process.env.BLOCK_TAG),
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
