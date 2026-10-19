import { Elysia } from 'elysia';
import { getEvaluationController } from '../controllers/getEvaluation.controller';
import { getEvaluationsController } from '../controllers/getEvaluations.controller';
import { createPoolEvaluationController } from '../controllers/createPoolEvaluation.controller';
import { createBusinessEvaluationController } from '../controllers/createBusinessEvaluation.controller';
import { withTraceSync } from '@shared/monitoring/src/tracing';
import type { ServicesPlugin } from './services.plugin';

export const createControllersPlugin = (servicesPlugin: ServicesPlugin) => {
  const getEvaluationCtrl = withTraceSync('ai-evaluator.init.controllers.get_evaluation', () =>
    getEvaluationController(servicesPlugin),
  );

  const getEvaluationsCtrl = withTraceSync('ai-evaluator.init.controllers.get_evaluations', () =>
    getEvaluationsController(servicesPlugin),
  );

  const createPoolEvaluationCtrl = withTraceSync('ai-evaluator.init.controllers.create_pool_evaluation', () =>
    createPoolEvaluationController(servicesPlugin),
  );

  const createBusinessEvaluationCtrl = withTraceSync('ai-evaluator.init.controllers.create_business_evaluation', () =>
    createBusinessEvaluationController(servicesPlugin),
  );

  const plugin = withTraceSync('ai-evaluator.init.controllers.plugin', () =>
    new Elysia({ name: 'Controllers' })
      .use(getEvaluationCtrl)
      .use(getEvaluationsCtrl)
      .use(createPoolEvaluationCtrl)
      .use(createBusinessEvaluationCtrl),
  );

  return plugin;
};

export type ControllersPlugin = ReturnType<typeof createControllersPlugin>;
