import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getDocuments: QueryResolvers['getDocuments'] = async (_parent, { input }, { clients }) => {
  const response = await clients.documentsClient.getDocuments.post({
    filter: input?.filter || {},
    sort: input?.sort || {},
    limit: input?.limit,
    offset: input?.offset,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to get documents',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return data.map((doc) => ({
    id: doc.id,
    folderId: doc.folderId,
    name: doc.name,
    fileId: doc.fileId,
    path: doc.path,
    url: doc.url,
    mimeType: doc.mimeType,
    size: doc.size,
    ownerId: doc.ownerId,
    ownerType: doc.ownerType,
    creator: doc.creator,
    parentId: doc.parentId,
    grandParentId: doc.grandParentId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }));
};
