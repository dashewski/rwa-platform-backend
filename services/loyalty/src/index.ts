import { createApp } from './app';
import { withTraceAsync } from '@shared/monitoring/src/tracing';

const chainIds: string[] = JSON.parse(String(process.env.CHAIN_IDS));
const treasuries: Record<string, string> = JSON.parse(String(process.env.TREASURIES));

const app = await withTraceAsync('loyalty.init.main', async () => {
  return await createApp(
    String(process.env.MONGODB_URI) + '/' + String(process.env.MONGODB_DBNAME),
    String(process.env.RABBITMQ_URL),
    String(process.env.SIGNERS_MANAGER_URL),
    Number(process.env.LOYALTY_REFERRAL_REWARD_PERCENTAGE),
    chainIds.map((chainId) => ({ chainId, referralTreasuryAddress: treasuries[chainId] })),
    chainIds,
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
