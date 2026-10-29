import { Elysia } from 'elysia';
import { getUserRequest, getUserResponse } from '../models/validation/user.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Private endpoint
export const createGetUserController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetUserController' }).use(servicesPlugin).post(
    '/getUser',
    async ({ body, authService }) => {
      return await authService.getUser(body.userId);
    },
    {
      body: getUserRequest,
      response: getUserResponse,
    },
  );
};
