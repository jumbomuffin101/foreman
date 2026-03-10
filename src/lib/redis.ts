import Redis, { RedisOptions } from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const parsedRedisUrl = new URL(redisUrl);

export const redisConnectionOptions: RedisOptions = {
  host: parsedRedisUrl.hostname,
  port: parsedRedisUrl.port ? Number(parsedRedisUrl.port) : 6379,
  username: parsedRedisUrl.username || undefined,
  password: parsedRedisUrl.password || undefined,
  db: parsedRedisUrl.pathname ? Number(parsedRedisUrl.pathname.replace("/", "")) || 0 : 0,
  maxRetriesPerRequest: null,
};

const redis = new Redis(redisConnectionOptions);

redis.on("ready", () => {
  console.log("Redis connected");
});

redis.on("error", (error: Error) => {
  console.error("Redis connection error:", error);
  process.exit(1);
});

export default redis;