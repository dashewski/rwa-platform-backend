import { Elysia } from 'elysia';
import { getEvaluationController } from '../controllers/getEvaluation.controller';
import { getEvaluationsController } from '../controllers/getEvaluations.controller';
import { jobEvaluationController } from '../controllers/jobEvaluation.controller';
import { withTraceSync } from '@shared/monitoring/src/tracing';
import type { ServicesPlugin } from './services.plugin';

export const createControllersPlugin = (servicesPlugin: ServicesPlugin) => {
  const plugin = withTraceSync('ai-evaluator.init.controllers.plugin', () =>
    new Elysia({ name: 'Controllers' })
      .use(servicesPlugin)
      .use(getEvaluationController(servicesPlugin))
      .use(getEvaluationsController(servicesPlugin))
      .use(jobEvaluationController(servicesPlugin)),
  );

  return plugin;
};

export type ControllersPlugin = ReturnType<typeof createControllersPlugin>;
