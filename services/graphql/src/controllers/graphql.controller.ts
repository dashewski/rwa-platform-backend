import { Elysia } from 'elysia';
import { yogaServer } from '../graphql/server';

// Public endpoint
export const GraphQLController = new Elysia()
  .all('/', (context) => yogaServer.handle(context.request))
  .all('/stream', (context) => yogaServer.handle(context.request));
