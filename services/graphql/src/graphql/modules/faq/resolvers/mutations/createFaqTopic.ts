import type { MutationResolvers } from '../../../../generated/types';
import { AppError } from '@shared/errors/app-errors';

export const createFaqTopic: MutationResolvers['createFaqTopic'] = async (
  _parent,
  { input },
  { services, clients, user },
) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  const { grandParentId, ownerId, ownerType } = await services.parent.getParentInfo(
    input.type,
    input.parentId,
    user.id,
  );

  await services.ownership.checkOwnership({
    userId: user.id,
    ownerId,
    ownerType,
    permission: 'content',
  });

  const response = await clients.faqClient.createTopic.post({
    name: input.name,
    ownerId,
    ownerType,
    creator: user.id,
    parentId: input.parentId,
    grandParentId,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to create FAQ topic',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return {
    id: data.id,
    name: data.name,
    ownerId: data.ownerId,
    ownerType: data.ownerType,
    creator: data.creator,
    parentId: data.parentId,
    grandParentId: data.grandParentId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};
