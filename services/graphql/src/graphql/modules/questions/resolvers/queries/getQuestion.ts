import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getQuestion: QueryResolvers['getQuestion'] = async (_parent, { id }, { clients }) => {
  const response = await clients.questionsClient.getQuestion.post({
    id,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get question', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const question = response.data;

  return question;
};
