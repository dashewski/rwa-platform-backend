import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getTopic: QueryResolvers['getTopic'] = async (_parent, { id }, { clients }) => {
  const response = await clients.questionsClient.getTopic.post({
    id,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get topic', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const topic = response.data;

  return topic;
};
