import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const deleteQuestion: MutationResolvers['deleteQuestion'] = async (
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

  // Get question first to check permissions
  const questionResponse = await clients.questionsClient.getQuestion.post({
    id,
  });

  if (questionResponse.error) {
    throw new AppError({
      message: 'Failed to get question data',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const question = questionResponse.data;

  await services.ownership.checkOwnership({
    userId: user.id,
    ownerId: question.ownerId,
    ownerType: question.ownerType,
    permission: 'content',
  });

  const response = await clients.questionsClient.deleteQuestion.post({
    id,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to delete question',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  return response.data.id;
};
