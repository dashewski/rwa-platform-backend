import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { createAnswerRequest, createAnswerResponse } from '../../models/validation/faq.validation';

// Private endpoint
export const createAnswerController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreateAnswerController' }).use(servicesPlugin).post(
    '/createAnswer',
    async ({ body, faqService }) => {
      return await faqService.createAnswer(body);
    },
    {
      body: createAnswerRequest,
      response: createAnswerResponse,
    },
  );
};
