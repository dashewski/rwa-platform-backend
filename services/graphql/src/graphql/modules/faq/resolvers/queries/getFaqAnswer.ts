import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getFaqAnswer: QueryResolvers['getFaqAnswer'] = async (_parent, { id }, { clients }) => {
  const response = await clients.faqClient.getAnswer.post({
    id,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get answer', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const answer = response.data;

  return {
    id: answer.id,
    topicId: answer.topicId,
    question: answer.question,
    answer: answer.answer,
    order: answer.order,
    ownerId: answer.ownerId,
    ownerType: answer.ownerType,
    creator: answer.creator,
    parentId: answer.parentId,
    grandParentId: answer.grandParentId,
    createdAt: answer.createdAt,
    updatedAt: answer.updatedAt,
  };
};
