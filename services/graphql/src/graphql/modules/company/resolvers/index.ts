import type { Resolvers } from '../../../generated/types';
import { createCompany } from './mutations/createCompany';
import { updateCompany } from './mutations/updateCompany';
import { deleteCompany } from './mutations/deleteCompany';
import { addMember } from './mutations/addMember';
import { removeMember } from './mutations/removeMember';
import { grantPermission } from './mutations/grantPermission';
import { revokePermission } from './mutations/revokePermission';
import { getCompany } from './queries/getCompany';
import { getCompanies } from './queries/getCompanies';

export const companyResolvers: Resolvers = {
  Query: {
    getCompany,
    getCompanies,
  },
  Mutation: {
    createCompany,
    updateCompany,
    deleteCompany,
    addMember,
    removeMember,
    grantPermission,
    revokePermission,
  },
};
