import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getFaqTopic: QueryResolvers['getFaqTopic'] = async (_parent, { id }, { clients }) => {
  const response = await clients.faqClient.getTopic.post({
    id,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get topic', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const topic = response.data;

  return {
    id: topic.id,
    name: topic.name,
    ownerId: topic.ownerId,
    ownerType: topic.ownerType,
    creator: topic.creator,
    parentId: topic.parentId,
    grandParentId: topic.grandParentId,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
  };
};
