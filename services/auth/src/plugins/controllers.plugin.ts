import { Elysia } from 'elysia';
import { createAuthenticateController } from '../controllers/authenticate.controller';
import { createChallengeController } from '../controllers/challenge.controller';
import { createRefreshController } from '../controllers/refresh.controller';
import { createGetUserController } from '../controllers/getUser.controller';
import { createLogoutController } from '../controllers/logout.controller';
import { createLogoutAllController } from '../controllers/logoutAll.controller';
import { withTraceSync } from '@shared/monitoring/src/tracing';
import type { ServicesPlugin } from './services.plugin';

export const createControllersPlugin = (servicesPlugin: ServicesPlugin) => {
  const authenticateController = withTraceSync('auth.init.controllers.authentication', () =>
    createAuthenticateController(servicesPlugin),
  );

  const challengeController = withTraceSync('auth.init.controllers.challenge', () =>
    createChallengeController(servicesPlugin),
  );

  const refreshController = withTraceSync('auth.init.controllers.refresh', () =>
    createRefreshController(servicesPlugin),
  );

  const getUserController = withTraceSync('auth.init.controllers.get_user', () =>
    createGetUserController(servicesPlugin),
  );

  const logoutController = withTraceSync('auth.init.controllers.logout', () =>
    createLogoutController(servicesPlugin),
  );

  const logoutAllController = withTraceSync('auth.init.controllers.logout_all', () =>
    createLogoutAllController(servicesPlugin),
  );

  const plugin = withTraceSync('auth.init.controllers.plugin', () =>
    new Elysia({ name: 'Controllers' })
      .use(authenticateController)
      .use(challengeController)
      .use(refreshController)
      .use(getUserController)
      .use(logoutController)
      .use(logoutAllController),
  );

  return plugin;
};
