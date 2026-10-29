import { Elysia, t } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getTokenMetadataResponse } from '../../models/validation/token.validation';

// Public endpoint
export const getTokenMetadataController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetTokenMetadataController' })
    .use(servicesPlugin)
    .get(
      '/api/rwa/metadata/:rwaAddress/:tokenId',
      async ({ params: { rwaAddress, tokenId }, tokenService }) => {
        return await tokenService.getTokenMetadata({ rwaAddress, tokenId });
      },
      {
        params: t.Object({
          rwaAddress: t.String({ minLength: 1 }),
          tokenId: t.String({ minLength: 1 }),
        }),
        response: getTokenMetadataResponse,
      },
    );
};
