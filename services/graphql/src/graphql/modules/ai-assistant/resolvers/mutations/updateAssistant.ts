import type { MutationResolvers } from '../../../../generated/types';
import { AppError } from '@shared/errors/app-errors';

export const updateAssistant: MutationResolvers['updateAssistant'] = async (_parent, { input }, { clients, user }) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  // Verify assistant ownership first
  const assistantResponse = await clients.aiAssistantClient.getAssistant.post({
    id: input.id,
  });

  if (assistantResponse.error || assistantResponse.data.userId !== user.id) {
    throw new AppError({
      message: 'Access denied: Assistant does not belong to the current user',
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }

  const response = await clients.aiAssistantClient.updateAssistant.post({
    id: input.id,
    name: input.name,
    contextPreferences: input.contextPreferences,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to update assistant',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return {
    id: data.id,
    name: data.name,
    userId: data.userId,
    contextPreferences: data.contextPreferences,
  };
};
