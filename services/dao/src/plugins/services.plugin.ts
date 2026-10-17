import { Elysia } from 'elysia';
import { DaoService } from '../services/dao.service';
import type { RepositoriesPlugin } from './repositories.plugin';
import { withTraceSync } from '@shared/monitoring/src/tracing';

export const createServicesPlugin = (repositoriesPlugin: RepositoriesPlugin) => {
  const daoService = withTraceSync('dao.init.services.dao', () =>
    new DaoService(
      repositoriesPlugin.decorator.proposalRepository,
      repositoriesPlugin.decorator.stakingRepository,
      repositoriesPlugin.decorator.stakingHistoryRepository,
      repositoriesPlugin.decorator.timelockTaskRepository,
      repositoriesPlugin.decorator.treasuryWithdrawRepository,
      repositoriesPlugin.decorator.voteRepository,
    ),
  );

  const plugin = withTraceSync('dao.init.services.plugin', () =>
    new Elysia({ name: 'Services' }).use(repositoriesPlugin).decorate('daoService', daoService),
  );

  return plugin;
};

export type ServicesPlugin = ReturnType<typeof createServicesPlugin>;
