import { Elysia } from 'elysia';
import { monitoringPlugin } from '@shared/monitoring/src/monitoring.plugin';
import { healthPlugin } from '@shared/monitoring/src/health.plugin';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createRepositoriesPlugin } from './plugins/repositories.plugin';
import { createServicesPlugin } from './plugins/services.plugin';
import { createControllersPlugin } from './plugins/controllers.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export async function createApp(
  mongoUri: string,
  jwtSecret: string,
  accessTokenExpiry: any,
  refreshTokenExpiry: any,
  domainName: string,
  domainVersion: string,
  signDomain: string,
  challengeTtlSeconds: number,
  cookieName: string,
  cookieMaxAge: number,
  cookieSecure: boolean,
  cookiePath: string,
) {
  const repositoriesPlugin = await withTraceAsync(
    'auth.init.repositories_plugin',
    async () => await createRepositoriesPlugin(mongoUri),
  );

  const servicesPlugin = withTraceSync('auth.init.services_plugin', () =>
    createServicesPlugin(
      repositoriesPlugin,
      jwtSecret,
      accessTokenExpiry,
      refreshTokenExpiry,
      domainName,
      domainVersion,
      signDomain,
      challengeTtlSeconds,
      cookieName,
      cookieMaxAge,
      cookieSecure,
      cookiePath,
    ),
  );

  const controllersPlugin = withTraceSync('auth.init.controllers', () => createControllersPlugin(servicesPlugin));

  const app = withTraceSync('auth.init.elysia', () => {
    return new Elysia()
      .use(monitoringPlugin)
      .use(healthPlugin)
      .onError(ErrorHandlerPlugin)
      .use(repositoriesPlugin)
      .use(servicesPlugin)
      .use(controllersPlugin);
  });

  return app;
}
