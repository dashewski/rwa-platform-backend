import { Elysia } from 'elysia';
import {
  createAuthClient,
  createCompanyClient,
  createDocumentsClient,
  createFilesClient,
  createGalleryClient,
  createRwaClient,
} from '../clients/eden.clients';
import { RedisClient } from '../clients/redis.client';
import { withTraceAsync, withTraceSync } from '@shared/monitoring/src/tracing';

export const createClientsPlugin = (
  authServiceUrl: string,
  filesServiceUrl: string,
  documentsServiceUrl: string,
  galleryServiceUrl: string,
  rwaServiceUrl: string,
  companyServiceUrl: string,
  redisUrl: string,
) => {
  const authClient = withTraceSync('upload.init.clients.auth', () => createAuthClient(authServiceUrl));
  const filesClient = withTraceSync('upload.init.clients.files', () => createFilesClient(filesServiceUrl));
  const documentsClient = withTraceSync('upload.init.clients.documents', () =>
    createDocumentsClient(documentsServiceUrl),
  );
  const galleryClient = withTraceSync('upload.init.clients.gallery', () => createGalleryClient(galleryServiceUrl));
  const rwaClient = withTraceSync('upload.init.clients.rwa', () => createRwaClient(rwaServiceUrl));
  const companyClient = withTraceSync('upload.init.clients.company', () => createCompanyClient(companyServiceUrl));

  const redisClient = withTraceSync('upload.init.clients.redis', () => new RedisClient(redisUrl));

  return withTraceSync('upload.init.clients.plugin', () =>
    new Elysia({ name: 'Clients' })
      .decorate('authClient', authClient)
      .decorate('filesClient', filesClient)
      .decorate('documentsClient', documentsClient)
      .decorate('galleryClient', galleryClient)
      .decorate('rwaClient', rwaClient)
      .decorate('companyClient', companyClient)
      .decorate('redisClient', redisClient)
      .onStop(async () => {
        await withTraceAsync('upload.stop.clients.redis', async () => {
          redisClient.disconnect();
        });
      }),
  );
};

export type ClientsPlugin = ReturnType<typeof createClientsPlugin>;
