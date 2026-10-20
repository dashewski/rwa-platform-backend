import { t } from 'elysia';
import { paginationSchema } from './shared.validation';

/*
 * Base model schema
 */
export const eventSchema = t.Object({
  id: t.String(),
  chainId: t.String(),
  blockNumber: t.Number(),
  transactionHash: t.String(),
  logIndex: t.Number(),
  address: t.String(),
  name: t.String(),
  data: t.Record(t.String(), t.Any()),
  timestamp: t.Number(),
});

/*
 * Get by id
 */
export const getEventByIdRequest = t.Pick(eventSchema, ['id']);

export const getEventByIdResponse = eventSchema;

/*
 * Get events
 */
export const getEventsRequest = t.Object({
  chainId: t.Optional(t.String()),
  blockNumber: t.Optional(t.Number()),
  transactionHash: t.Optional(t.String()),
  address: t.Optional(t.String()),
  name: t.Optional(t.String()),
  pagination: t.Optional(paginationSchema),
});

export const getEventsResponse = t.Array(eventSchema);
