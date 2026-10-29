import type { MutationResolvers } from '../../../../generated/types';
import { AppError } from '@shared/errors/app-errors';

export const deleteFaqAnswer: MutationResolvers['deleteFaqAnswer'] = async (
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

  // Get answer first to check permissions
  const answerResponse = await clients.faqClient.getAnswer.post({
    id,
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

  const response = await clients.faqClient.deleteAnswer.post({
    id,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to delete FAQ answer',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  return response.data.id;
};
