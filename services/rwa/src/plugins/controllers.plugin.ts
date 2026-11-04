import { Elysia } from 'elysia';

import { createBusinessController } from '../controllers/business/createBusiness.controller';
import { getTokenMetadataController } from '../controllers/token/getTokenMetadata.controller';
import { editBusinessController } from '../controllers/business/editBusiness.controller';
import { requestBusinessApprovalSignaturesController } from '../controllers/business/requestBusinessApprovalSignatures.controller';
import { rejectBusinessApprovalSignaturesController } from '../controllers/business/rejectBusinessApprovalSignatures.controller';
import { getBusinessController } from '../controllers/business/getBusiness.controller';
import { getBusinessesController } from '../controllers/business/getBusinesses.controller';
import { createBusinessWithAIController } from '../controllers/business/createBusinessWithAI.controller';

import { createPoolController } from '../controllers/pool/createPool.controller';
import { editPoolController } from '../controllers/pool/editPool.controller';
import { requestPoolApprovalSignaturesController } from '../controllers/pool/requestPoolApprovalSignatures.controller';
import { rejectPoolApprovalSignaturesController } from '../controllers/pool/rejectPoolApprovalSignatures.controller';
import { getPoolController } from '../controllers/pool/getPool.controller';
import { getPoolsController } from '../controllers/pool/getPools.controller';
import { createPoolWithAIController } from '../controllers/pool/createPoolWithAI.controller';
import { updatePoolImageController } from '../controllers/pool/updatePoolImage.controller';
import { updateBusinessImageController } from '../controllers/business/updateBusinessImage.controller';
import type { ServicesPlugin } from './services.plugin';
import { withTraceSync } from '@shared/monitoring/src/tracing';

export const createControllersPlugin = (servicesPlugin: ServicesPlugin) => {
  const createBusinessCtrl = withTraceSync('rwa.init.controllers.create_business', () =>
    createBusinessController(servicesPlugin),
  );

  const editBusinessCtrl = withTraceSync('rwa.init.controllers.edit_business', () =>
    editBusinessController(servicesPlugin),
  );

  const requestBusinessApprovalSignaturesCtrl = withTraceSync(
    'rwa.init.controllers.request_business_approval_signatures',
    () => requestBusinessApprovalSignaturesController(servicesPlugin),
  );

  const rejectBusinessApprovalSignaturesCtrl = withTraceSync(
    'rwa.init.controllers.reject_business_approval_signatures',
    () => rejectBusinessApprovalSignaturesController(servicesPlugin),
  );

  const getBusinessCtrl = withTraceSync('rwa.init.controllers.get_business', () =>
    getBusinessController(servicesPlugin),
  );

  const getBusinessesCtrl = withTraceSync('rwa.init.controllers.get_businesses', () =>
    getBusinessesController(servicesPlugin),
  );

  const createBusinessWithAICtrl = withTraceSync('rwa.init.controllers.create_business_with_ai', () =>
    createBusinessWithAIController(servicesPlugin),
  );

  const createPoolCtrl = withTraceSync('rwa.init.controllers.create_pool', () => createPoolController(servicesPlugin));

  const editPoolCtrl = withTraceSync('rwa.init.controllers.edit_pool', () => editPoolController(servicesPlugin));

  const requestPoolApprovalSignaturesCtrl = withTraceSync('rwa.init.controllers.request_pool_approval_signatures', () =>
    requestPoolApprovalSignaturesController(servicesPlugin),
  );

  const rejectPoolApprovalSignaturesCtrl = withTraceSync('rwa.init.controllers.reject_pool_approval_signatures', () =>
    rejectPoolApprovalSignaturesController(servicesPlugin),
  );

  const getPoolCtrl = withTraceSync('rwa.init.controllers.get_pool', () => getPoolController(servicesPlugin));

  const getPoolsCtrl = withTraceSync('rwa.init.controllers.get_pools', () => getPoolsController(servicesPlugin));

  const createPoolWithAICtrl = withTraceSync('rwa.init.controllers.create_pool_with_ai', () =>
    createPoolWithAIController(servicesPlugin),
  );

  const getTokenMetadataCtrl = withTraceSync('rwa.init.controllers.get_token_metadata', () =>
    getTokenMetadataController(servicesPlugin),
  );

  const updatePoolImageCtrl = withTraceSync('rwa.init.controllers.update_pool_image', () =>
    updatePoolImageController(servicesPlugin),
  );

  const updateBusinessImageCtrl = withTraceSync('rwa.init.controllers.update_business_image', () =>
    updateBusinessImageController(servicesPlugin),
  );

  const plugin = withTraceSync('rwa.init.controllers.plugin', () =>
    new Elysia({ name: 'Controllers' })
      // Business controllers
      .use(createBusinessCtrl)
      .use(editBusinessCtrl)
      .use(requestBusinessApprovalSignaturesCtrl)
      .use(rejectBusinessApprovalSignaturesCtrl)
      .use(getBusinessCtrl)
      .use(getBusinessesCtrl)
      .use(createBusinessWithAICtrl)
      // Pool controllers
      .use(createPoolCtrl)
      .use(editPoolCtrl)
      .use(requestPoolApprovalSignaturesCtrl)
      .use(rejectPoolApprovalSignaturesCtrl)
      .use(getPoolCtrl)
      .use(getPoolsCtrl)
      .use(createPoolWithAICtrl)
      // Token controllers
      .use(getTokenMetadataCtrl)
      // Image controllers
      .use(updatePoolImageCtrl)
      .use(updateBusinessImageCtrl),
  );

  return plugin;
};

export type ControllersPlugin = ReturnType<typeof createControllersPlugin>;
