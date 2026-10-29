import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const createQuestion: MutationResolvers['createQuestion'] = async (
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
  const topicResponse = await clients.questionsClient.getTopic.post({
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

  const response = await clients.questionsClient.createQuestion.post({
    topicId: input.topicId,
    text: input.text,
    ownerId: topic.ownerId,
    ownerType: topic.ownerType,
    creator: user.id,
    parentId: topic.parentId,
    grandParentId: topic.grandParentId,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to create question',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return {
    id: data.id,
    topicId: data.topicId,
    text: data.text,
    answer: data.answer,
    answered: data.answered,
    likesCount: data.likesCount,
    ownerId: data.ownerId,
    ownerType: data.ownerType,
    creator: data.creator,
    parentId: data.parentId,
    grandParentId: data.grandParentId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};
