import { Elysia } from 'elysia';
import { getEvaluationController } from '../controllers/getEvaluation.controller';
import { getEvaluationsController } from '../controllers/getEvaluations.controller';
import { evaluateController } from '../controllers/evaluate.controller';
import { withTraceSync } from '@shared/monitoring/src/tracing';
import type { ServicesPlugin } from './services.plugin';

export const createControllersPlugin = (servicesPlugin: ServicesPlugin) => {
  const getEvaluationCtrl = withTraceSync('ai-evaluator.init.controllers.get_evaluation', () =>
    getEvaluationController(servicesPlugin),
  );

  const getEvaluationsCtrl = withTraceSync('ai-evaluator.init.controllers.get_evaluations', () =>
    getEvaluationsController(servicesPlugin),
  );

  const evaluateCtrl = withTraceSync('ai-evaluator.init.controllers.evaluate', () =>
    evaluateController(servicesPlugin),
  );

  const plugin = withTraceSync('ai-evaluator.init.controllers.plugin', () =>
    new Elysia({ name: 'Controllers' }).use(getEvaluationCtrl).use(getEvaluationsCtrl).use(evaluateCtrl),
  );

  return plugin;
};

export type ControllersPlugin = ReturnType<typeof createControllersPlugin>;
