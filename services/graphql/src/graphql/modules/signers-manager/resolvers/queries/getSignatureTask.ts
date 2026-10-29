import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getSignatureTask: QueryResolvers['getSignatureTask'] = async (
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

  const response = await clients.signersManagerClient.getSignatureTask.post({
    taskId: input.taskId,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to get signature task',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const signatureTask = response.data;

  await services.ownership.checkOwnership({
    userId: user.id,
    ownerId: signatureTask.ownerId,
    ownerType: signatureTask.ownerType,
    permission: 'deploy',
  });

  return signatureTask;
};
