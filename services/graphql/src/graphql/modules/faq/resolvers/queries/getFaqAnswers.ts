import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getFaqAnswers: QueryResolvers['getFaqAnswers'] = async (_parent, { input }, { clients }) => {
  const response = await clients.faqClient.getAnswers.post({
    filter: input?.filter || {},
    sort: input?.sort || {},
    limit: input?.limit,
    offset: input?.offset,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get answers', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const { data } = response;

  return data.map((answer) => ({
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
  }));
};
