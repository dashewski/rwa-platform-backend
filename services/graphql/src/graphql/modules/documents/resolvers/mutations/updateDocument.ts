import type { MutationResolvers } from '../../../../generated/types';
import { AppError } from '@shared/errors/app-errors';

export const updateDocument: MutationResolvers['updateDocument'] = async (
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

  // Get document first to check permissions
  const documentResponse = await clients.documentsClient.getDocument.post({
    id: input.id,
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

  const response = await clients.documentsClient.updateDocument.post({
    id: input.id,
    updateData: input.updateData,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to update document',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return {
    id: data.id,
    folderId: data.folderId,
    name: data.name,
    fileId: data.fileId,
    path: data.path,
    url: data.url,
    mimeType: data.mimeType,
    size: data.size,
    ownerId: data.ownerId,
    ownerType: data.ownerType,
    creator: data.creator,
    parentId: data.parentId,
    grandParentId: data.grandParentId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};
