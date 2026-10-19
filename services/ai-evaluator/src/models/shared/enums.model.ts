import { t } from 'elysia';

/*
 * Entity type enum
 */
export const EntityTypeList = ['business', 'pool'] as const;

export const entityTypeSchema = t.Union([t.Literal('business'), t.Literal('pool')]);

export type EntityType = typeof entityTypeSchema.static;
