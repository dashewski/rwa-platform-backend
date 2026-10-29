import { t } from 'elysia';

/*
 * Document upload
 */
export const uploadDocumentRequest = t.Object({
  file: t.File(),
  folderId: t.String(),
  name: t.String(),
});

export const uploadDocumentResponse = t.Object({
  id: t.String(),
  folderId: t.String(),
  name: t.String(),
  fileId: t.String(),
  path: t.String(),
  url: t.String(),
  mimeType: t.String(),
  size: t.Number(),
  ownerId: t.String(),
  ownerType: t.String(),
  creator: t.String(),
  parentId: t.String(),
  grandParentId: t.String(),
  createdAt: t.Number(),
  updatedAt: t.Number(),
});

/*
 * Gallery image upload
 */
export const uploadImageRequest = t.Object({
  file: t.File(),
  galleryId: t.String(),
  name: t.String(),
  description: t.String(),
});

export const uploadImageResponse = t.Object({
  id: t.String(),
  galleryId: t.String(),
  name: t.String(),
  description: t.String(),
  fileId: t.String(),
  path: t.String(),
  url: t.String(),
  mimeType: t.String(),
  size: t.Number(),
  ownerId: t.String(),
  ownerType: t.String(),
  creator: t.String(),
  parentId: t.String(),
  grandParentId: t.String(),
  createdAt: t.Number(),
  updatedAt: t.Number(),
});

/*
 * Pool image upload
 */
export const uploadPoolImageRequest = t.Object({
  file: t.File(),
  poolId: t.String(),
});

export const uploadPoolImageResponse = t.Object({
  id: t.String(),
  image: t.Optional(t.String()),
  imageUrl: t.String(),
});

/*
 * Business image upload
 */
export const uploadBusinessImageRequest = t.Object({
  file: t.File(),
  businessId: t.String(),
});

export const uploadBusinessImageResponse = t.Object({
  id: t.String(),
  image: t.Optional(t.String()),
  imageUrl: t.String(),
});
