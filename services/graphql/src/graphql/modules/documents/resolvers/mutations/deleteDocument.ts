import type { MutationResolvers } from '../../../../generated/types';
import { AppError } from '@shared/errors/app-errors';

export const deleteDocument: MutationResolvers['deleteDocument'] = async (
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

  // Get document first to check permissions
  const documentResponse = await clients.documentsClient.getDocument.post({
    id,
  });

  if (documentResponse.error) {
    throw new AppError({
      message: 'Failed to get document data',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const document = documentResponse.data;

  await services.ownership.checkOwnership({
    userId: user.id,
    ownerId: document.ownerId,
    ownerType: document.ownerType,
    permission: 'content',
  });

  // Delete file from files service
  await clients.filesClient.deleteFile.post({ id: document.fileId });

  const response = await clients.documentsClient.deleteDocument.post({
    id,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to delete document',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  return response.data.id;
};
