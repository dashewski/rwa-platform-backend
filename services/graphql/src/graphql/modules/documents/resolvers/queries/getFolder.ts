import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getFolder: QueryResolvers['getFolder'] = async (_parent, { id }, { clients }) => {
  const response = await clients.documentsClient.getFolder.post({
    id,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get folder', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const folder = response.data;

  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    ownerId: folder.ownerId,
    ownerType: folder.ownerType,
    creator: folder.creator,
    grandParentId: folder.grandParentId,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
};
