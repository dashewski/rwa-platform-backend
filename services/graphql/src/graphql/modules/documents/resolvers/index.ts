import type { Resolvers } from '../../../generated/types';
import { getDocument } from './queries/getDocument';
import { getDocuments } from './queries/getDocuments';
import { getFolder } from './queries/getFolder';
import { getFolders } from './queries/getFolders';
import { updateDocument } from './mutations/updateDocument';
import { deleteDocument } from './mutations/deleteDocument';
import { createFolder } from './mutations/createFolder';
import { updateFolder } from './mutations/updateFolder';
import { deleteFolder } from './mutations/deleteFolder';

export const documentsResolvers: Resolvers = {
  Query: {
    getDocument,
    getDocuments,
    getFolder,
    getFolders,
  },
  Mutation: {
    updateDocument,
    deleteDocument,
    createFolder,
    updateFolder,
    deleteFolder,
  },
};
