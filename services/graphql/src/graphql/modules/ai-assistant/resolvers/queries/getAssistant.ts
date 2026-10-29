import type { QueryResolvers } from '../../../../generated/types';
import { AppError } from '@shared/errors/app-errors';

export const getAssistant: QueryResolvers['getAssistant'] = async (_parent, { id }, { clients, user }) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  const response = await clients.aiAssistantClient.getAssistant.post({
    id,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to get assistant',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  // Verify that the assistant belongs to the current user
  if (data.userId !== user.id) {
    throw new AppError({
      message: 'Access denied: Assistant does not belong to the current user',
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }

  return {
    id: data.id,
    name: data.name,
    userId: data.userId,
    contextPreferences: data.contextPreferences,
  };
};
