import type { Resolvers } from '../../../generated/types';
import { getBusiness } from './queries/getBusiness';
import { getBusinesses } from './queries/getBusinesses';
import { getPool } from './queries/getPool';
import { getPools } from './queries/getPools';

import { poolDeployed } from './subscriptions/poolDeployed';

import { createBusiness } from './mutations/business/createBusiness';
import { editBusiness } from './mutations/business/editBusiness';
import { requestBusinessApprovalSignatures } from './mutations/business/requestBusinessApprovalSignatures';
import { rejectBusinessApprovalSignatures } from './mutations/business/rejectBusinessApprovalSignatures';

import { createPool } from './mutations/pool/createPool';
import { editPool } from './mutations/pool/editPool';
import { requestPoolApprovalSignatures } from './mutations/pool/requestPoolApprovalSignatures';
import { rejectPoolApprovalSignatures } from './mutations/pool/rejectPoolApprovalSignatures';
import { createBusinessWithAI } from './mutations/business/createBusinessWithAI';
import { createPoolWithAI } from './mutations/pool/createPoolWithAI';

export const rwaResolvers: Resolvers = {
  Query: {
    getBusiness,
    getBusinesses,
    getPool,
    getPools,
  },
  Mutation: {
    createBusiness,
    createBusinessWithAI,
    editBusiness,
    requestBusinessApprovalSignatures,
    rejectBusinessApprovalSignatures,
    createPool,
    createPoolWithAI,
    editPool,
    requestPoolApprovalSignatures,
    rejectPoolApprovalSignatures,
  },
  Subscription: {
    poolDeployed,
  },
};
