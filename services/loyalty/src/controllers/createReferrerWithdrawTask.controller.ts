import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import {
  createReferrerWithdrawTaskRequest,
  createReferrerWithdrawTaskResponse,
} from '../models/validation/loyalty.validation';

// Private endpoint
export const createReferrerWithdrawTaskController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreateReferrerWithdrawTaskController' }).use(servicesPlugin).post(
    '/createReferrerWithdrawTask',
    async ({ body, loyaltyService }) => {
      return await loyaltyService.createReferrerWithdrawTask(body);
    },
    {
      body: createReferrerWithdrawTaskRequest,
      response: createReferrerWithdrawTaskResponse,
    },
  );
};
