import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getTopicsRequest, getTopicsResponse } from '../../models/validation/faq.validation';

// Private endpoint
export const getTopicsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetTopicsController' }).use(servicesPlugin).post(
    '/getTopics',
    async ({ body, faqService }) => {
      return await faqService.getTopics(body);
    },
    {
      body: getTopicsRequest,
      response: getTopicsResponse,
    },
  );
};
