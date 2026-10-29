import type { MutationResolvers } from '../../../../generated/types';
import { AppError } from '@shared/errors/app-errors';

export const deleteMessage: MutationResolvers['deleteMessage'] = async (_parent, { id }, { clients, user }) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  // Get message first to check assistant ownership
  const messageResponse = await clients.aiAssistantClient.getMessage.post({
    id,
  });

  if (messageResponse.error) {
    throw new AppError({ message: 'Failed to get message', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  // Verify assistant ownership
  const assistantResponse = await clients.aiAssistantClient.getAssistant.post({
    id: messageResponse.data.assistantId,
  });

  if (assistantResponse.error || assistantResponse.data.userId !== user.id) {
    throw new AppError({
      message: 'Access denied: Message does not belong to the current user',
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }

  const response = await clients.aiAssistantClient.deleteMessage.post({
    id,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to delete message',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return {
    id: data.id,
  };
};
