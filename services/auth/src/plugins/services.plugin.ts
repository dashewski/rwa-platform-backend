import { Elysia } from 'elysia';
import { AuthService } from '../services/auth.service';
import { SessionsJwt } from '@shared/sessions/src/sessionsJwt';
import type { RepositoriesPlugin } from './repositories.plugin';
import { withTraceSync } from '@shared/monitoring/src/tracing';

export const createServicesPlugin = (
  repositoriesPlugin: RepositoriesPlugin,
  jwtSecret: string,
  accessTokenExpiry: any,
  refreshTokenExpiry: any,
  domainName: string,
  domainVersion: string,
  signDomain: string,
  challengeTtlSeconds: number,
  cookieName: string,
  cookieMaxAge: number,
  cookieSecure: boolean,
  cookiePath: string,
) => {
  const sessionsJwt = withTraceSync('auth.init.services.jwt', () => new SessionsJwt(jwtSecret));

  const authService = withTraceSync(
    'auth.init.services.auth',
    () =>
      new AuthService(
        repositoriesPlugin.decorator.userRepository,
        repositoriesPlugin.decorator.sessionRepository,
        repositoriesPlugin.decorator.challengeRepository,
        sessionsJwt,
        accessTokenExpiry,
        refreshTokenExpiry,
        domainName,
        domainVersion,
        signDomain,
        challengeTtlSeconds,
        cookieName,
        cookieMaxAge,
        cookieSecure,
        cookiePath,
      ),
  );

  const plugin = withTraceSync('auth.init.services.plugin', () =>
    new Elysia({ name: 'Services' })
      .use(repositoriesPlugin)
      .decorate('authService', authService),
  );

  return plugin;
};

export type ServicesPlugin = ReturnType<typeof createServicesPlugin>;
