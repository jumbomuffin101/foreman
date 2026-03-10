import { Queue } from "bullmq";
import { redisConnectionOptions } from "./redis";

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 1000,
  },
  removeOnComplete: false,
  removeOnFail: false,
};

export const PRODUCER_RATE_LIMIT_MAX = 10;
export const PRODUCER_RATE_LIMIT_WINDOW_MS = 10_000;

export const jobQueue = new Queue("foreman-jobs", {
  connection: redisConnectionOptions,
  defaultJobOptions,
});

export const deadLetterQueue = new Queue("foreman-dlq", {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    removeOnComplete: false,
    removeOnFail: false,
  },
});

const getProducerLimiterKey = (producerId: string): string =>
  `${jobQueue.opts.prefix ?? "bull"}:${jobQueue.name}:producer-rate-limit:${producerId}`;

export const isProducerRateLimited = async (
  producerId: string,
): Promise<{ limited: boolean; ttlMs: number }> => {
  try {
    const client = await jobQueue.client;
    const limiterKey = getProducerLimiterKey(producerId);

    const count = await client.incr(limiterKey);

    if (count === 1) {
      await client.pexpire(limiterKey, PRODUCER_RATE_LIMIT_WINDOW_MS);
    }

    const ttlMs = await client.pttl(limiterKey);

    return {
      limited: count > PRODUCER_RATE_LIMIT_MAX,
      ttlMs: ttlMs > 0 ? ttlMs : PRODUCER_RATE_LIMIT_WINDOW_MS,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown producer limiter error";
    throw new Error(`Failed to evaluate producer rate limit: ${message}`);
  }
};
