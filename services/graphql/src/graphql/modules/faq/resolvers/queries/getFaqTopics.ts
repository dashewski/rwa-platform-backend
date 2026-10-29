import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getFaqTopics: QueryResolvers['getFaqTopics'] = async (_parent, { input }, { clients }) => {
  const response = await clients.faqClient.getTopics.post({
    filter: input?.filter || {},
    sort: input?.sort || {},
    limit: input?.limit,
    offset: input?.offset,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get topics', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const { data } = response;

  return data.map((topic) => ({
    id: topic.id,
    name: topic.name,
    ownerId: topic.ownerId,
    ownerType: topic.ownerType,
    creator: topic.creator,
    parentId: topic.parentId,
    grandParentId: topic.grandParentId,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
  }));
};
