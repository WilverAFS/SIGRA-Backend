import logger from 'jet-logger';
import { createClient } from 'redis';
import { Env } from '#src/common/constants/env.constants.ts';

const redisUrl = Env.REDIS_URL ?? 'redis://localhost:6379';

const redis = createClient({ url: redisUrl });

redis.on('error', (err) => {
  logger.err(`Redis error: ${String(err)}`);
});

export async function ensureRedisConnected(): Promise<void> {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export async function closeRedis(): Promise<void> {
  if (redis.isOpen) {
    await redis.quit();
  }
}

export default redis;