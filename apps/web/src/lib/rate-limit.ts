import { Redis } from 'ioredis';
const state = globalThis as unknown as { limitRedis?: Redis };
export async function rateLimit(key: string, limit: number, seconds: number) {
  if (!state.limitRedis) {
    const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: 1, connectTimeout: 3000, retryStrategy: () => null });
    connection.on('error', () => {});
    connection.on('end', () => { if (state.limitRedis === connection) state.limitRedis = undefined; });
    state.limitRedis = connection;
  }
  const redis = state.limitRedis;
  const count = await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", 1, `seo-limit:${key}`, seconds);
  return Number(count) <= limit;
}
