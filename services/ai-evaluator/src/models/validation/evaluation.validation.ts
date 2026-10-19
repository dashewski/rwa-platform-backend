import { t } from 'elysia';
import { entityTypeSchema } from '../shared/enums.model';

export const evaluationSchema = t.Object({
  id: t.String(),
  entityType: entityTypeSchema,
  parentId: t.String(),
  grandParentId: t.String(),
  ownerId: t.String(),
  ownerType: t.String(),
  status: t.Union([t.Literal('pending'), t.Literal('completed'), t.Literal('failed')]),
  riskScore: t.Optional(t.Number()),
  reasoning: t.Optional(t.String()),
  factors: t.Array(
    t.Object({
      name: t.String(),
      impact: t.String(),
      detail: t.String(),
    }),
  ),
  stage1Response: t.Optional(t.String()),
  stage2Response: t.Optional(t.String()),
  evaluatedDocuments: t.Array(
    t.Object({
      id: t.String(),
      name: t.String(),
      mimeType: t.String(),
    }),
  ),
  evaluatedImages: t.Array(
    t.Object({
      id: t.String(),
      name: t.String(),
    }),
  ),
  modelUsed: t.Optional(t.String()),
  createdAt: t.Number(),
  updatedAt: t.Number(),
});

/* Start evaluation */
export const startEvaluationRequest = t.Object({
  entityType: entityTypeSchema,
  entityId: t.String(),
  ownerId: t.String(),
  ownerType: t.String(),
});
export const startEvaluationResponse = t.Object({
  evaluationId: t.String(),
});

/* Get evaluation */
export const getEvaluationRequest = t.Pick(evaluationSchema, ['id']);
export const getEvaluationResponse = evaluationSchema;

/* Get evaluations list */
export const getEvaluationsRequest = t.Object({
  filter: t.Record(t.String(), t.Any()),
  sort: t.Optional(t.Record(t.String(), t.Union([t.Literal('asc'), t.Literal('desc')]))),
  limit: t.Optional(t.Number()),
  offset: t.Optional(t.Number()),
});
export const getEvaluationsResponse = t.Array(evaluationSchema);

export const createPoolEvaluationRequest = t.Object({
  poolId: t.String({ minLength: 1 }),
  ownerId: t.String({ minLength: 1 }),
  ownerType: t.String({ minLength: 1 }),
});

export const createBusinessEvaluationRequest = t.Object({
  businessId: t.String({ minLength: 1 }),
  ownerId: t.String({ minLength: 1 }),
  ownerType: t.String({ minLength: 1 }),
});

export const createEvaluationResponse = t.Object({
  jobId: t.String(),
});
