import { AppError } from '@shared/errors/app-errors';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { setSpanAttributes } from '@shared/monitoring/src/tracing';
import type { DocumentsClient, FilesClient, GalleryClient, RwaClient } from '../clients/eden.clients';
import type { OwnershipService } from '@shared/ownership/src/ownership.service';

export class UploadService {
  constructor(
    private readonly filesClient: FilesClient,
    private readonly documentsClient: DocumentsClient,
    private readonly galleryClient: GalleryClient,
    private readonly rwaClient: RwaClient,
    private readonly ownershipService: OwnershipService,
    private readonly documentsAllowedMimeTypes: string[],
    private readonly galleryAllowedMimeTypes: string[],
    private readonly tokenImageAllowedMimeTypes: string[],
  ) {}

  @TraceDecorator()
  async uploadDocument(userId: string, data: { file: File; folderId: string; name: string }) {
    setSpanAttributes({ userId, folderId: data.folderId });

    this.assertMimeType(data.file, this.documentsAllowedMimeTypes);

    const folderResponse = await this.documentsClient.getFolder.post({ id: data.folderId });

    if (folderResponse.error) {
      throw new AppError({ message: 'Failed to get folder data', statusCode: 502, code: 'BAD_GATEWAY' });
    }

    const folder = folderResponse.data;

    await this.ownershipService.checkOwnership({
      userId,
      ownerId: folder.ownerId,
      ownerType: folder.ownerType,
      permission: 'content',
    });

    const file = await this.createFile(data.file);

    const response = await this.documentsClient.createDocument.post({
      folderId: data.folderId,
      name: data.name,
      fileId: file.id,
      path: file.path,
      mimeType: file.mimeType,
      size: file.size,
      ownerId: folder.ownerId,
      ownerType: folder.ownerType,
      creator: userId,
      parentId: folder.parentId,
      grandParentId: folder.grandParentId,
    });

    if (response.error) {
      await this.filesClient.deleteFile.post({ id: file.id });

      throw new AppError({ message: 'Failed to create document', statusCode: 502, code: 'BAD_GATEWAY' });
    }

    return response.data;
  }

  @TraceDecorator()
  async uploadImage(userId: string, data: { file: File; galleryId: string; name: string; description: string }) {
    setSpanAttributes({ userId, galleryId: data.galleryId });

    this.assertMimeType(data.file, this.galleryAllowedMimeTypes);

    const galleryResponse = await this.galleryClient.getGallery.post({ id: data.galleryId });

    if (galleryResponse.error) {
      throw new AppError({ message: 'Failed to get gallery data', statusCode: 502, code: 'BAD_GATEWAY' });
    }

    const gallery = galleryResponse.data;

    await this.ownershipService.checkOwnership({
      userId,
      ownerId: gallery.ownerId,
      ownerType: gallery.ownerType,
      permission: 'content',
    });

    const file = await this.createFile(data.file);

    const response = await this.galleryClient.createImage.post({
      galleryId: data.galleryId,
      name: data.name,
      description: data.description,
      fileId: file.id,
      path: file.path,
      mimeType: file.mimeType,
      size: file.size,
      ownerId: gallery.ownerId,
      ownerType: gallery.ownerType,
      creator: userId,
      parentId: gallery.parentId,
      grandParentId: gallery.grandParentId,
    });

    if (response.error) {
      await this.filesClient.deleteFile.post({ id: file.id });

      throw new AppError({ message: 'Failed to create image', statusCode: 502, code: 'BAD_GATEWAY' });
    }

    return response.data;
  }

  @TraceDecorator()
  async uploadPoolImage(userId: string, data: { file: File; poolId: string }) {
    setSpanAttributes({ userId, poolId: data.poolId });

    this.assertMimeType(data.file, this.tokenImageAllowedMimeTypes);

    const poolResponse = await this.rwaClient.getPool.post({ id: data.poolId });

    if (poolResponse.error) {
      throw new AppError({ message: 'Failed to get pool data', statusCode: 502, code: 'BAD_GATEWAY' });
    }

    const pool = poolResponse.data;

    await this.ownershipService.checkOwnership({
      userId,
      ownerId: pool.ownerId,
      ownerType: pool.ownerType,
      permission: 'content',
    });

    const file = await this.createFile(data.file);

    const response = await this.rwaClient.updatePoolImage.post({
      id: data.poolId,
      image: file.path,
      fileId: file.id,
    });

    if (response.error) {
      await this.filesClient.deleteFile.post({ id: file.id });

      throw new AppError({ message: 'Failed to update pool image', statusCode: 502, code: 'BAD_GATEWAY' });
    }

    return {
      id: response.data.id,
      image: response.data.image,
      imageUrl: response.data.imageUrl ?? '',
    };
  }

  @TraceDecorator()
  async uploadBusinessImage(userId: string, data: { file: File; businessId: string }) {
    setSpanAttributes({ userId, businessId: data.businessId });

    this.assertMimeType(data.file, this.tokenImageAllowedMimeTypes);

    const businessResponse = await this.rwaClient.getBusiness.post({ id: data.businessId });

    if (businessResponse.error) {
      throw new AppError({ message: 'Failed to get business data', statusCode: 502, code: 'BAD_GATEWAY' });
    }

    const business = businessResponse.data;

    await this.ownershipService.checkOwnership({
      userId,
      ownerId: business.ownerId,
      ownerType: business.ownerType,
      permission: 'content',
    });

    const file = await this.createFile(data.file);

    const response = await this.rwaClient.updateBusinessImage.post({
      id: data.businessId,
      image: file.path,
      fileId: file.id,
    });

    if (response.error) {
      await this.filesClient.deleteFile.post({ id: file.id });

      throw new AppError({ message: 'Failed to update business image', statusCode: 502, code: 'BAD_GATEWAY' });
    }

    return {
      id: response.data.id,
      image: response.data.image,
      imageUrl: response.data.imageUrl ?? '',
    };
  }

  private assertMimeType(file: File, allowed: string[]) {
    const mimeType = file.type.split(';')[0].trim();

    if (!allowed.includes(mimeType)) {
      throw new AppError({
        message: `File type "${mimeType}" is not allowed. Allowed types: ${allowed.join(', ')}`,
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }
  }

  private async createFile(file: File) {
    const response = await this.filesClient.createFile.post({ file });

    if (response.error) {
      throw new AppError({ message: 'Failed to upload file', statusCode: 502, code: 'BAD_GATEWAY' });
    }

    return response.data;
  }
}
