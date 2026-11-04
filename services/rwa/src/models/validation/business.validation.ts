import { t } from 'elysia';
import { businessTypeSchema } from '../shared/enums.model';

/*
 * Shared schemas
 */
export const socialLinkSchema = t.Object({
  type: t.String(),
  url: t.String(),
});

/*
 * Entity schema
 */
export const businessSchema = t.Object({
  id: t.String(),
  chainId: t.String(),
  name: t.String(),
  ownerId: t.String(),
  ownerType: t.String(),
  ownerWallet: t.Optional(t.String()),
  tokenAddress: t.Optional(t.String()),
  description: t.Optional(t.String()),
  tags: t.Optional(t.Array(t.String())),
  riskScore: t.Optional(t.Number()),
  image: t.Optional(t.String()),
  imageUrl: t.Optional(t.String()),
  fileId: t.Optional(t.String()),
  approvalSignaturesTaskId: t.Optional(t.String()),
  approvalSignaturesTaskExpired: t.Optional(t.Number()),
  country: t.Optional(t.String()),
  businessType: t.Optional(businessTypeSchema),
  socials: t.Array(socialLinkSchema),
  paused: t.Boolean(),
  createdAt: t.Number(),
  updatedAt: t.Number(),
});

/*
 * Create Business
 */
export const createBusinessRequest = t.Composite([
  t.Pick(businessSchema, ['name', 'ownerId', 'ownerType', 'chainId']),
  t.Partial(t.Pick(businessSchema, ['description', 'tags', 'image', 'country', 'businessType', 'socials'])),
]);
export const createBusinessResponse = businessSchema;

/*
 * Create Business with AI
 */
export const createBusinessWithAIRequest = t.Object({
  description: t.String(),
  ownerId: t.String(),
  ownerType: t.String(),
  chainId: t.String(),
});
export const createBusinessWithAIResponse = businessSchema;

/*
 * Edit Business
 */
export const editBusinessRequest = t.Object({
  id: t.String(),
  updateData: t.Partial(
    t.Pick(businessSchema, ['chainId', 'name', 'description', 'tags', 'image', 'country', 'businessType', 'socials']),
  ),
});
export const editBusinessResponse = businessSchema;

/*
 * Request Approval Signatures
 */
export const requestBusinessApprovalSignaturesRequest = t.Object({
  id: t.String(),
  ownerWallet: t.String(),
  deployerWallet: t.String(),
  createRWAFee: t.String(),
});
export const requestBusinessApprovalSignaturesResponse = t.Object({
  taskId: t.String(),
});

/*
 * Reject Approval Signatures
 */
export const rejectBusinessApprovalSignaturesRequest = t.Pick(businessSchema, ['id']);
export const rejectBusinessApprovalSignaturesResponse = t.Object({});

/*
 * Get Business
 */
export const getBusinessRequest = t.Pick(businessSchema, ['id']);
export const getBusinessResponse = businessSchema;

/*
 * Get Businesses
 */
export const getBusinessesRequest = t.Object({
  filter: t.Optional(t.Record(t.String(), t.Any())),
  sort: t.Optional(t.Record(t.String(), t.Union([t.Literal('asc'), t.Literal('desc')]))),
  limit: t.Optional(t.Number()),
  offset: t.Optional(t.Number()),
});
export const getBusinessesResponse = t.Array(businessSchema);

/*
 * Update Business Image
 */
export const updateBusinessImageRequest = t.Object({
  id: t.String(),
  image: t.String(),
  fileId: t.String(),
});
export const updateBusinessImageResponse = businessSchema;
