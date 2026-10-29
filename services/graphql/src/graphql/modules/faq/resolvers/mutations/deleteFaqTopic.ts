import type { MutationResolvers } from '../../../../generated/types';
import { AppError } from '@shared/errors/app-errors';

export const deleteFaqTopic: MutationResolvers['deleteFaqTopic'] = async (
  _parent,
  { id },
  { services, clients, user },
) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  // Get topic first to check permissions
  const topicResponse = await clients.faqClient.getTopic.post({
    id,
  });

  if (topicResponse.error) {
    throw new AppError({
      message: 'Failed to get FAQ topic data',
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

  const response = await clients.faqClient.deleteTopic.post({
    id,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to delete FAQ topic',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  return response.data.id;
};
