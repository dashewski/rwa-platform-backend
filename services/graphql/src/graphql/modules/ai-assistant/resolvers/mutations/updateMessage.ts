import type { MutationResolvers } from '../../../../generated/types';
import { AppError } from '@shared/errors/app-errors';

export const updateMessage: MutationResolvers['updateMessage'] = async (_parent, { input }, { clients, user }) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  // Get message first to check assistant ownership
  const messageResponse = await clients.aiAssistantClient.getMessage.post({
    id: input.id,
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

  const response = await clients.aiAssistantClient.updateMessage.post({
    id: input.id,
    text: input.text,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to update message',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return {
    id: data.id,
    assistantId: data.assistantId,
    text: data.text,
    sender: data.sender,
  };
};
