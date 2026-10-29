import { Elysia } from 'elysia';
import { monitoringPlugin } from '@shared/monitoring/src/monitoring.plugin';
import { healthPlugin } from '@shared/monitoring/src/health.plugin';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createClientsPlugin } from './plugins/clients.plugin';
import { createServicesPlugin } from './plugins/services.plugin';
import { createControllersPlugin } from './plugins/controllers.plugin';
import { withTraceAsync, withTraceSync } from '@shared/monitoring/src/tracing';

export async function createApp(
  redisUrl: string,
  jwtSecret: string,
  authServiceUrl: string,
  filesServiceUrl: string,
  documentsServiceUrl: string,
  galleryServiceUrl: string,
  rwaServiceUrl: string,
  companyServiceUrl: string,
  documentsAllowedMimeTypes: string[],
  galleryAllowedMimeTypes: string[],
  tokenImageAllowedMimeTypes: string[],
) {
  const clientsPlugin = await withTraceAsync('upload.init.clients_plugin', async () =>
    createClientsPlugin(
      authServiceUrl,
      filesServiceUrl,
      documentsServiceUrl,
      galleryServiceUrl,
      rwaServiceUrl,
      companyServiceUrl,
      redisUrl,
    ),
  );

  const servicesPlugin = withTraceSync('upload.init.services_plugin', () =>
    createServicesPlugin(
      clientsPlugin,
      jwtSecret,
      documentsAllowedMimeTypes,
      galleryAllowedMimeTypes,
      tokenImageAllowedMimeTypes,
    ),
  );

  const controllersPlugin = withTraceSync('upload.init.controllers_plugin', () =>
    createControllersPlugin(servicesPlugin),
  );

  return withTraceSync('upload.init.elysia', () =>
    new Elysia()
      .use(monitoringPlugin)
      .use(healthPlugin)
      .onError(ErrorHandlerPlugin)
      .use(clientsPlugin)
      .use(servicesPlugin)
      .use(controllersPlugin),
  );
}
