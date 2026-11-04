import { t } from 'elysia';
import { entityTypeSchema } from '../shared/enums.model';

/*
 * Evaluate
 */
export const evaluateBody = t.Object({
  entityType: entityTypeSchema,
  entityId: t.String({ minLength: 1 }),
  ownerId: t.String({ minLength: 1 }),
  ownerType: t.String({ minLength: 1 }),
});

export const evaluateResponse = t.Object({
  evaluationId: t.String(),
});
