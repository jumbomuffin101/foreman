import dotenv from "dotenv";
import { Job as BullJob, Worker } from "bullmq";
import prisma from "../lib/prisma";
import { deadLetterQueue } from "../lib/queue";
import { redisConnectionOptions } from "../lib/redis";

dotenv.config();

interface ForemanJobData {
  jobId: string;
  type: string;
  payload: Record<string, unknown>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const updateFailedJob = async (jobId: string, error: unknown): Promise<void> => {
  try {
    const message = error instanceof Error ? error.message : "Unknown job error";
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "failed",
        failedAt: new Date(),
        error: message,
      },
    });
  } catch (updateError) {
    console.error("Failed to update failed job state:", updateError);
  }
};

const worker = new Worker<ForemanJobData>(
  "foreman-jobs",
  async (job: BullJob<ForemanJobData>) => {
    const { jobId } = job.data;

    try {
      console.log(`Job received: ${jobId} (BullMQ ID: ${job.id})`);

      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "active",
          startedAt: new Date(),
          attempts: {
            increment: 1,
          },
          failedAt: null,
          error: null,
        },
      });

      const randomDelayMs = Math.floor(Math.random() * 1000) + 1000;
      await sleep(randomDelayMs);

      if (
        typeof job.data.payload === "object" &&
        job.data.payload !== null &&
        "forceFail" in job.data.payload &&
        job.data.payload.forceFail === true
      ) {
        throw new Error("Forced failure requested by payload");
      }

      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "completed",
          processedAt: new Date(),
          result: {
            message: "processed",
          },
          error: null,
          failedAt: null,
        },
      });

      console.log(`Job completed: ${jobId} (BullMQ ID: ${job.id})`);
      return { message: "processed" };
    } catch (error) {
      console.error(`Job failed in processor: ${jobId} (BullMQ ID: ${job.id})`, error);
      await updateFailedJob(jobId, error);
      throw error;
    }
  },
  {
    connection: redisConnectionOptions,
    concurrency: 5,
  },
);

worker.on("failed", async (job: BullJob<ForemanJobData> | undefined, error: Error) => {
  try {
    if (!job) {
      console.error("Worker emitted failed event without a job:", error);
      return;
    }

    console.error(
      `Job failed event: ${job.data.jobId} (BullMQ ID: ${job.id}) attempt ${job.attemptsMade}/${job.opts.attempts}`,
    );

    const maxAttempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;

    if (job.attemptsMade >= maxAttempts) {
      console.error(
        `Job exhausted retries and will be dead-lettered: ${job.data.jobId} (BullMQ ID: ${job.id})`,
      );

      await deadLetterQueue.add(job.name, {
        originalJobId: job.data.jobId,
        originalBullJobId: job.id,
        type: job.data.type,
        payload: job.data.payload,
        error: error.message,
      });

      await prisma.job.update({
        where: { id: job.data.jobId },
        data: {
          status: "dead",
          failedAt: new Date(),
          error: error.message,
        },
      });
    }
  } catch (deadLetterError) {
    console.error("Failed to process failed event for dead letter handling:", deadLetterError);
  }
});

worker.on("completed", (job: BullJob<ForemanJobData> | undefined) => {
  if (!job) {
    return;
  }

  console.log(`Job completed event: ${job.data.jobId} (BullMQ ID: ${job.id})`);
});

worker.on("error", (error: Error) => {
  console.error("Worker error:", error);
});

console.log("Foreman worker started with concurrency 5");