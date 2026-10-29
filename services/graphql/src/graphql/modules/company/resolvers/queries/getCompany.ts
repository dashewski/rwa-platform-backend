import type { QueryResolvers } from '../../../../generated/types';

export const getCompany: QueryResolvers['getCompany'] = async (_parent, { id }, { services }) => {
  return await services.ownership.getCompany({ id });
};
