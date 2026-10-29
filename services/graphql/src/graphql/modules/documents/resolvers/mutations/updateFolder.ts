import type { MutationResolvers } from '../../../../generated/types';
import { AppError } from '@shared/errors/app-errors';

export const updateFolder: MutationResolvers['updateFolder'] = async (
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

  // Get folder first to check permissions
  const folderResponse = await clients.documentsClient.getFolder.post({
    id: input.id,
  });

  if (folderResponse.error) {
    throw new AppError({
      message: 'Failed to get folder data',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const folder = folderResponse.data;

  await services.ownership.checkOwnership({
    userId: user.id,
    ownerId: folder.ownerId,
    ownerType: folder.ownerType,
    permission: 'content',
  });

  const response = await clients.documentsClient.updateFolder.post({
    id: input.id,
    updateData: input.updateData,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to update folder',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return {
    id: data.id,
    name: data.name,
    parentId: data.parentId,
    ownerId: data.ownerId,
    ownerType: data.ownerType,
    creator: data.creator,
    grandParentId: data.grandParentId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};
