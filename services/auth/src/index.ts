import { createApp } from './app';
import { withTraceAsync } from '@shared/monitoring/src/tracing';

const app = await withTraceAsync('auth.init.main', async () => {
  return await createApp(
    String(process.env.MONGODB_URI) + '/' + String(process.env.MONGODB_DBNAME),
    String(process.env.JWT_SECRET),
    String(process.env.ACCESS_TOKEN_EXPIRY),
    String(process.env.REFRESH_TOKEN_EXPIRY),
    String(process.env.DOMAIN_NAME),
    String(process.env.DOMAIN_VERSION),
    String(process.env.BASE_DOMAIN),
    Number(process.env.CHALLENGE_TTL_SECONDS),
    String(process.env.AUTH_COOKIE_NAME),
    Number(process.env.AUTH_COOKIE_MAX_AGE),
    String(process.env.AUTH_COOKIE_SECURE) === 'true',
    String(process.env.AUTH_COOKIE_PATH),
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
