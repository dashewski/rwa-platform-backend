import type { MutationResolvers } from '../../../../generated/types';
import { AppError } from '@shared/errors/app-errors';

export const deleteFolder: MutationResolvers['deleteFolder'] = async (_parent, { id }, { services, clients, user }) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  // Get folder first to check permissions
  const folderResponse = await clients.documentsClient.getFolder.post({
    id,
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

  const response = await clients.documentsClient.deleteFolder.post({
    id,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to delete folder',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  return response.data.id;
};
