import { createApp } from './app';
import { withTraceAsync } from '@shared/monitoring/src/tracing';

const app = await withTraceAsync('loyalty.init.main', async () => {
  return await createApp(
    String(process.env.MONGODB_URI) + '/' + String(process.env.MONGODB_DBNAME),
    String(process.env.RABBITMQ_URL),
    String(process.env.SIGNERS_MANAGER_URL),
    Number(process.env.LOYALTY_REFERRAL_REWARD_PERCENTAGE),
    [
      {
        chainId: '97',
        name: 'BSC Testnet',
        referralTreasuryAddress: '0xcf56E77069cC2aBfA6c1Df9bfD4155F782697B9D',
      },
    ],
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
