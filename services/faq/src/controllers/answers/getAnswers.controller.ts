import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getAnswersRequest, getAnswersResponse } from '../../models/validation/faq.validation';

// Private endpoint
export const getAnswersController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetAnswersController' }).use(servicesPlugin).post(
    '/getAnswers',
    async ({ body, faqService }) => {
      return await faqService.getAnswers(body);
    },
    {
      body: getAnswersRequest,
      response: getAnswersResponse,
    },
  );
};
