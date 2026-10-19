import { extractFromToken } from '../utils/jwt.utils';

export class UserResolverService {
  async resolveUser(token: string | null): Promise<{ userId: string; wallet: string } | null> {
    if (!token) return null;

    return extractFromToken(token);
  }
}
