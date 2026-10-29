import { Elysia } from 'elysia';
import mongoose from 'mongoose';
import { UserRepository } from '../repositories/user.repository';
import { SessionRepository } from '../repositories/session.repository';
import { ChallengeRepository } from '../repositories/challenge.repository';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createRepositoriesPlugin = async (mongoUri: string) => {
  const userRepository = withTraceSync('auth.init.repositories.user', () => new UserRepository());

  const sessionRepository = withTraceSync(
    'auth.init.repositories.session',
    () => new SessionRepository(),
  );

  const challengeRepository = withTraceSync('auth.init.repositories.challenge', () => new ChallengeRepository());

  await withTraceAsync('auth.init.repositories_plugin.mongoose', async (ctx) => {
    mongoose.connection.once('connected', () => {
      ctx.end();
    });
    await mongoose.connect(mongoUri);
  });

  const plugin = withTraceSync('auth.init.repositories.plugin', () =>
    new Elysia({ name: 'Repositories' })
      .decorate('userRepository', userRepository)
      .decorate('sessionRepository', sessionRepository)
      .decorate('challengeRepository', challengeRepository)
      .onStop(async () => {
        await withTraceAsync('auth.stop.repositories_plugin', async () => {
          await mongoose.disconnect();
        });
      }),
  );

  return plugin;
};

export type RepositoriesPlugin = Awaited<ReturnType<typeof createRepositoriesPlugin>>;
