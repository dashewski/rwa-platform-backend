import { t } from 'elysia';
import { entityTypeSchema } from '../shared/enums.model';

export const evaluationSchema = t.Object({
  id: t.String(),
  entityType: entityTypeSchema,
  parentId: t.String(),
  grandParentId: t.String(),
  ownerId: t.String(),
  ownerType: t.String(),
  risk: t.Object({
    score: t.Optional(t.Number()),
    pros: t.Array(t.String()),
    cons: t.Array(t.String()),
  }),
  summary: t.String(),
  sources: t.Array(
    t.Object({
      type: t.String(),
      id: t.String(),
      name: t.String(),
      mimeType: t.String(),
    }),
  ),
  modelUsed: t.Optional(t.String()),
  createdAt: t.Number(),
  updatedAt: t.Number(),
});

export const jobEvaluationRequest = t.Object({
  entityType: entityTypeSchema,
  entityId: t.String({ minLength: 1 }),
});
export const jobEvaluationResponse = t.Object({
  evaluationId: t.String(),
});

export const getEvaluationRequest = t.Pick(evaluationSchema, ['id']);
export const getEvaluationResponse = evaluationSchema;

export const getEvaluationsRequest = t.Object({
  filter: t.Record(t.String(), t.Any()),
  sort: t.Optional(t.Record(t.String(), t.Union([t.Literal('asc'), t.Literal('desc')]))),
  limit: t.Optional(t.Number()),
  offset: t.Optional(t.Number()),
});
export const getEvaluationsResponse = t.Array(evaluationSchema);
