import { Elysia } from 'elysia';
import { SessionsJwt } from '@shared/sessions/src/sessionsJwt';
import { OwnershipService } from '@shared/ownership/src/ownership.service';
import { UploadService } from '../services/upload.service';
import type { ClientsPlugin } from './clients.plugin';
import { withTraceSync } from '@shared/monitoring/src/tracing';

export const createServicesPlugin = (
  clientsPlugin: ClientsPlugin,
  jwtSecret: string,
  documentsAllowedMimeTypes: string[],
  galleryAllowedMimeTypes: string[],
  tokenImageAllowedMimeTypes: string[],
) => {
  const ownershipService = withTraceSync(
    'upload.init.services.ownership',
    () =>
      new OwnershipService(
        clientsPlugin.decorator.redisClient,
        clientsPlugin.decorator.companyClient,
        clientsPlugin.decorator.authClient,
      ),
  );
  const sessionsJwt = withTraceSync(
    'upload.init.services.user_resolver',
    () => new SessionsJwt(jwtSecret),
  );

  const uploadService = withTraceSync(
    'upload.init.services.upload',
    () =>
      new UploadService(
        clientsPlugin.decorator.filesClient,
        clientsPlugin.decorator.documentsClient,
        clientsPlugin.decorator.galleryClient,
        clientsPlugin.decorator.rwaClient,
        ownershipService,
        documentsAllowedMimeTypes,
        galleryAllowedMimeTypes,
        tokenImageAllowedMimeTypes,
      ),
  );

  return withTraceSync('upload.init.services.plugin', () =>
    new Elysia({ name: 'Services' })
      .use(clientsPlugin)
      .decorate('ownershipService', ownershipService)
      .decorate('sessionsJwt', sessionsJwt)
      .decorate('uploadService', uploadService),
  );
};

export type ServicesPlugin = ReturnType<typeof createServicesPlugin>;
