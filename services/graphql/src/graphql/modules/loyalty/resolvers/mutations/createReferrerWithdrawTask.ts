import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const createReferrerWithdrawTask: MutationResolvers['createReferrerWithdrawTask'] = async (
  _parent,
  { input },
  { clients, user },
) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  // Get full user data from auth service
  const userResponse = await clients.authClient.getUser.post({
    userId: user.id,
  });

  if (userResponse.error) {
    throw new AppError({
      message: 'Failed to get user data',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const userData = userResponse.data;

  const response = await clients.loyaltyClient.createReferrerWithdrawTask.post({
    referrerWallet: userData.wallet,
    referrerId: user.id,
    chainId: input.chainId,
    tokenAddress: input.tokenAddress,
    amount: input.amount,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to create referrer withdraw task',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return data;
};
