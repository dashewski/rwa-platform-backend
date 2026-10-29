import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getFolders: QueryResolvers['getFolders'] = async (_parent, { input }, { clients }) => {
  const response = await clients.documentsClient.getFolders.post({
    filter: input?.filter || {},
    sort: input?.sort || {},
    limit: input?.limit,
    offset: input?.offset,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get folders', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const { data } = response;

  return data.map((folder) => ({
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    ownerId: folder.ownerId,
    ownerType: folder.ownerType,
    creator: folder.creator,
    grandParentId: folder.grandParentId,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  }));
};
