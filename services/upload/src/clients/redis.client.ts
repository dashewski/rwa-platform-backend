import { RedisWithTracing } from '@shared/monitoring/src/redis';

export class RedisClient extends RedisWithTracing {
  constructor(url: string) {
    super(url);
  }
}
