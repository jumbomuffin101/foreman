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