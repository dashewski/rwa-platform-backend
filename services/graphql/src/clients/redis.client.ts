import { CONFIG } from '../config';
import { RedisWithTracing } from '@shared/monitoring/src/redis';

export const redisClient = new RedisWithTracing(CONFIG.REDIS.URL);
