import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getTimelockTasksRequest, getTimelockTasksResponse } from '../models/validation/dao.validation';

// Private endpoint
export const getTimelockTasksController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetTimelockTasksController' }).use(servicesPlugin).post(
    '/getTimelockTasks',
    async ({ body, daoService }) => {
      return await daoService.getTimelockTasks(body);
    },
    {
      body: getTimelockTasksRequest,
      response: getTimelockTasksResponse,
    },
  );
};
