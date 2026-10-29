import type { MutationResolvers } from '../../../../generated/types';
import { AppError } from '@shared/errors/app-errors';

export const updateFaqAnswer: MutationResolvers['updateFaqAnswer'] = async (
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

  // Get answer first to check permissions
  const answerResponse = await clients.faqClient.getAnswer.post({
    id: input.id,
  });

  if (answerResponse.error) {
    throw new AppError({
      message: 'Failed to get answer data',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const answer = answerResponse.data;

  await services.ownership.checkOwnership({
    userId: user.id,
    ownerId: answer.ownerId,
    ownerType: answer.ownerType,
    permission: 'content',
  });

  const response = await clients.faqClient.updateAnswer.post({
    id: input.id,
    updateData: input.updateData,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to update FAQ answer',
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
