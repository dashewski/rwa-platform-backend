import { createApp } from './app';
import { withTraceAsync } from '@shared/monitoring/src/tracing';

const app = await withTraceAsync('testnet-faucet.init.main', async () => {
  return await createApp(
    String(process.env.MONGODB_URI) + '/' + String(process.env.MONGODB_DBNAME),
    String(process.env.PROVIDER_URL),
    String(process.env.WALLET_PRIVATE_KEY),
    String(process.env.HOLD_TOKEN_ADDRESS),
    String(process.env.PLATFORM_TOKEN_ADDRESS),
    Number(process.env.GAS_TOKEN_AMOUNT),
    Number(process.env.HOLD_TOKEN_AMOUNT),
    Number(process.env.PLATFORM_TOKEN_AMOUNT),
    Number(process.env.REQUEST_GAS_DELAY_MS),
    Number(process.env.REQUEST_HOLD_DELAY_MS),
    Number(process.env.REQUEST_PLATFORM_DELAY_MS),
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
