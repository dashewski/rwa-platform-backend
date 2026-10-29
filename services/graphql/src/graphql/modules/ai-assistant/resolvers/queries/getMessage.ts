import type { QueryResolvers } from '../../../../generated/types';
import { AppError } from '@shared/errors/app-errors';

export const getMessage: QueryResolvers['getMessage'] = async (_parent, { id }, { clients, user }) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  const response = await clients.aiAssistantClient.getMessage.post({
    id,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get message', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const { data } = response;

  // Get the assistant to verify ownership
  const assistantResponse = await clients.aiAssistantClient.getAssistant.post({
    id: data.assistantId,
  });

  if (assistantResponse.error || assistantResponse.data.userId !== user.id) {
    throw new AppError({
      message: 'Access denied: Message does not belong to the current user',
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }

  return {
    id: data.id,
    assistantId: data.assistantId,
    text: data.text,
    sender: data.sender,
  };
};
