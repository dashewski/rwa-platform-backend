import type { MutationResolvers } from '../../../../generated/types';
import { AppError } from '@shared/errors/app-errors';

export const createFaqAnswer: MutationResolvers['createFaqAnswer'] = async (
  _parent,
  { input },
  { services, clients, user },
) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  // Get topic info first
  const topicResponse = await clients.faqClient.getTopic.post({
    id: input.topicId,
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

  const response = await clients.faqClient.createAnswer.post({
    topicId: input.topicId,
    question: input.question,
    answer: input.answer,
    order: input.order || 0,
    ownerId: topic.ownerId,
    ownerType: topic.ownerType,
    creator: user.id,
    parentId: topic.parentId,
    grandParentId: topic.grandParentId,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to create FAQ answer',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return {
    id: data.id,
    topicId: data.topicId,
    question: data.question,
    answer: data.answer,
    order: data.order,
    ownerId: data.ownerId,
    ownerType: data.ownerType,
    creator: data.creator,
    parentId: data.parentId,
    grandParentId: data.grandParentId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};
