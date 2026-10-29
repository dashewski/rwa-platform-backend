import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getAnswerRequest, getAnswerResponse } from '../../models/validation/faq.validation';

// Private endpoint
export const getAnswerController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetAnswerController' }).use(servicesPlugin).post(
    '/getAnswer',
    async ({ body, faqService }) => {
      return await faqService.getAnswer(body.id);
    },
    {
      body: getAnswerRequest,
      response: getAnswerResponse,
    },
  );
};
