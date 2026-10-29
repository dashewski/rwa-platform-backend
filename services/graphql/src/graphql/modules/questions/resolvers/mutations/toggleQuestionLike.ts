import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const toggleQuestionLike: MutationResolvers['toggleQuestionLike'] = async (
  _parent,
  { questionId },
  { clients, user },
) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  const response = await clients.questionsClient.toggleQuestionLike.post({
    questionId,
    userId: user.id,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to toggle question like',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  return response.data.liked;
};
