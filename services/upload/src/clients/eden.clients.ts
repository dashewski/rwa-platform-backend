import type { App as AuthApp } from '@services/auth/src';
import type { App as RwaApp } from '@services/rwa/src';
import type { App as FilesApp } from '@services/files/src';
import type { App as DocumentsApp } from '@services/documents/src';
import type { App as GalleryApp } from '@services/gallery/src';
import type { App as CompanyApp } from '@services/company/src';

import { createEdenTreatyClient } from '@shared/monitoring/src/eden';

export const createAuthClient = (url: string) => createEdenTreatyClient<AuthApp>(url);
export const createFilesClient = (url: string) => createEdenTreatyClient<FilesApp>(url);
export const createDocumentsClient = (url: string) => createEdenTreatyClient<DocumentsApp>(url);
export const createGalleryClient = (url: string) => createEdenTreatyClient<GalleryApp>(url);
export const createRwaClient = (url: string) => createEdenTreatyClient<RwaApp>(url);
export const createCompanyClient = (url: string) => createEdenTreatyClient<CompanyApp>(url);

export type AuthClient = ReturnType<typeof createAuthClient>;
export type FilesClient = ReturnType<typeof createFilesClient>;
export type DocumentsClient = ReturnType<typeof createDocumentsClient>;
export type GalleryClient = ReturnType<typeof createGalleryClient>;
export type RwaClient = ReturnType<typeof createRwaClient>;
export type CompanyClient = ReturnType<typeof createCompanyClient>;
