import { makeExecutableSchema } from '@graphql-tools/schema';
import { createYoga } from 'graphql-yoga';
import { loadFilesSync } from '@graphql-tools/load-files';
import { mergeTypeDefs } from '@graphql-tools/merge';
import { join } from 'path';
import { resolvers } from '../modules';
import { userResolverService } from '../../services/services.init';
import {
  authClient,
  aiAssistantClient,
  testnetFaucetClient,
  rwaClient,
  filesClient,
  signersManagerClient,
  documentsClient,
  galleryClient,
  questionsClient,
  faqClient,
  blogClient,
  companyClient,
  portfolioClient,
  chartsClient,
  reactionsClient,
  loyaltyClient,
  daoClient,
  aiEvaluatorClient,
  apiKeysClient,
} from '../../clients/eden.clients';
import type { GraphQLContext, User } from '../context/types';
import { cacheService, ownershipService, parentService, validationService } from '../../services/services.init';
import { pubSub } from '../../clients/events.client';
import { CONFIG } from '../../config';

import { useGraphQLSSE } from '@graphql-yoga/plugin-graphql-sse';
import { propagation, context, trace } from '@opentelemetry/api';
import { useOpenTelemetry } from '@envelop/opentelemetry';
import { logger } from '@shared/monitoring/src/monitoring.plugin';

const typesArray = loadFilesSync(join(__dirname, '../modules/**/*.graphql'));
const typeDefs = mergeTypeDefs(typesArray);
const schema = makeExecutableSchema({ typeDefs, resolvers });

export const yogaServer = createYoga({
  schema,
  plugins: [
    useOpenTelemetry(
      {
        resolvers: false,
        variables: false,
        result: false,
      },
      trace.getTracerProvider(),
    ),
    useGraphQLSSE({
      endpoint: '/graphql/stream',
    }),
  ],
  cors: false,
  graphiql: {
    subscriptionsProtocol: 'SSE',
    endpoint: '/gateway/graphql',
  },
  logging: {
    debug: (...args: any[]) => logger.debug(String(args[0]), args[1]),
    info: (...args: any[]) => logger.info(String(args[0]), args[1]),
    warn: (...args: any[]) => logger.warn(String(args[0]), args[1]),
    error: (...args: any[]) => logger.error(String(args[0]), args[1]),
  },
  maskedErrors: false,
  async context({ request }) {
    const traceparent = request.headers.get('traceparent');
    const tracestate = request.headers.get('tracestate');

    // Extract trace context from headers
    const headers: Record<string, string> = {};
    if (traceparent) headers.traceparent = traceparent;
    if (tracestate) headers.tracestate = tracestate;

    // Extract the parent context from headers
    const parentContext = propagation.extract(context.active(), headers);

    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1] ?? null;

    let user: User | null = null;
    if (token) {
      const userData = await userResolverService.resolveUser(token);
      if (userData) {
        user = {
          id: userData.userId,
          wallet: userData.wallet,
        };
      }
    }

    return {
      clients: {
        aiAssistantClient,
        authClient,
        testnetFaucetClient,
        rwaClient,
        filesClient,
        signersManagerClient,
        documentsClient,
        galleryClient,
        questionsClient,
        faqClient,
        blogClient,
        portfolioClient,
        companyClient,
        chartsClient,
        reactionsClient,
        loyaltyClient,
        daoClient,
        aiEvaluatorClient,
        apiKeysClient,
      },
      services: {
        cache: cacheService,
        ownership: ownershipService,
        parent: parentService,
        validation: validationService,
      },
      user,
      token,
      pubSub,
      // Add the extracted trace context for use in resolvers
      traceContext: parentContext,
      fileValidation: CONFIG.FILE_VALIDATION,
    } as GraphQLContext;
  },
  batching: true,
});
