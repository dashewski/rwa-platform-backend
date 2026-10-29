import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const deleteTopic: MutationResolvers['deleteTopic'] = async (_parent, { id }, { services, clients, user }) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  // Get topic first to check permissions
  const topicResponse = await clients.questionsClient.getTopic.post({
    id,
  });

  if (topicResponse.error) {
    throw new AppError({
      message: 'Failed to get topic data',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const topic = topicResponse.data;

  await services.ownership.checkOwnership({
    userId: user.id,
    ownerId: topic.ownerId,
    ownerType: topic.ownerType,
    permission: 'content',
  });

  const response = await clients.questionsClient.deleteTopic.post({
    id,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to delete topic', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  return response.data.id;
};
