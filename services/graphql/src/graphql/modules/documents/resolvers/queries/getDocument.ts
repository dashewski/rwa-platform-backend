import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getDocument: QueryResolvers['getDocument'] = async (_parent, { id }, { clients }) => {
  const response = await clients.documentsClient.getDocument.post({
    id,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get document', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const document = response.data;

  return {
    id: document.id,
    folderId: document.folderId,
    name: document.name,
    fileId: document.fileId,
    path: document.path,
    url: document.url,
    mimeType: document.mimeType,
    size: document.size,
    ownerId: document.ownerId,
    ownerType: document.ownerType,
    creator: document.creator,
    parentId: document.parentId,
    grandParentId: document.grandParentId,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
};
