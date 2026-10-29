import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const registerReferral: MutationResolvers['registerReferral'] = async (
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

  let referrerWallet: string | undefined = undefined;
  if (input.referrerId) {
    const referrerResponse = await clients.authClient.getUser.post({
      userId: input.referrerId,
    });
    if (!referrerResponse.error) {
      referrerWallet = referrerResponse.data.wallet;
    }
  }

  const response = await clients.loyaltyClient.registerReferral.post({
    userWallet: userData.wallet,
    userId: user.id,
    referrerWallet: referrerWallet,
    referrerId: input.referrerId,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to register referral',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return data;
};
