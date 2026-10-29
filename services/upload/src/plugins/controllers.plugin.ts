import { Elysia } from 'elysia';
import { uploadDocumentController } from '../controllers/uploadDocument.controller';
import { uploadImageController } from '../controllers/uploadImage.controller';
import { uploadPoolImageController } from '../controllers/uploadPoolImage.controller';
import { uploadBusinessImageController } from '../controllers/uploadBusinessImage.controller';
import { withTraceSync } from '@shared/monitoring/src/tracing';
import type { ServicesPlugin } from './services.plugin';

export const createControllersPlugin = (servicesPlugin: ServicesPlugin) => {
  const uploadDocumentCtrl = withTraceSync('upload.init.controllers.upload_document', () =>
    uploadDocumentController(servicesPlugin),
  );

  const uploadImageCtrl = withTraceSync('upload.init.controllers.upload_image', () => uploadImageController(servicesPlugin));

  const uploadPoolImageCtrl = withTraceSync('upload.init.controllers.upload_pool_image', () =>
    uploadPoolImageController(servicesPlugin),
  );

  const uploadBusinessImageCtrl = withTraceSync('upload.init.controllers.upload_business_image', () =>
    uploadBusinessImageController(servicesPlugin),
  );

  return withTraceSync('upload.init.controllers.plugin', () =>
    new Elysia({ name: 'Controllers' })
      .use(uploadDocumentCtrl)
      .use(uploadImageCtrl)
      .use(uploadPoolImageCtrl)
      .use(uploadBusinessImageCtrl),
  );
};
