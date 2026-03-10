import dotenv from "dotenv";
import { Prisma } from "@prisma/client";
import { Job as BullJob, Worker } from "bullmq";
import prisma from "../lib/prisma";
import { deadLetterQueue } from "../lib/queue";
import { redisConnectionOptions } from "../lib/redis";

dotenv.config();

interface ForemanJobData {
  jobId: string;
  producerId: string;
  type: string;
  payload: Record<string, unknown>;
}

interface EmailPayload {
  to: string;
  subject: string;
  body: string;
}

interface ReportPayload {
  userId: string;
  reportType: string;
}

interface EmailResult {
  sent: true;
  to: string;
  timestamp: string;
}

interface ReportResult {
  generated: true;
  userId: string;
  reportType: string;
  timestamp: string;
}

type JobResult = EmailResult | ReportResult;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const randomBetween = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const asNonEmptyString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required field: ${field}`);
  }

  return value;
};

const handleEmailJob = async (payload: Record<string, unknown>): Promise<EmailResult> => {
  try {
    const to = asNonEmptyString(payload.to, "to");
    const subject = asNonEmptyString(payload.subject, "subject");
    const body = asNonEmptyString(payload.body, "body");

    void subject;
    void body;

    await sleep(randomBetween(500, 800));

    return {
      sent: true,
      to,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email handler error";
    throw new Error(`Email job failed: ${message}`);
  }
};

const handleReportJob = async (payload: Record<string, unknown>): Promise<ReportResult> => {
  try {
    const userId = asNonEmptyString(payload.userId, "userId");
    const reportType = asNonEmptyString(payload.reportType, "reportType");

    await sleep(randomBetween(1500, 2500));

    return {
      generated: true,
      userId,
      reportType,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown report handler error";
    throw new Error(`Report job failed: ${message}`);
  }
};

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
    const { jobId, type, payload } = job.data;

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

      let result: JobResult;

      switch (type) {
        case "email":
          result = await handleEmailJob(payload);
          break;
        case "report":
          result = await handleReportJob(payload);
          break;
        default:
          throw new Error(`Unknown job type: ${type}`);
      }

      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "completed",
          processedAt: new Date(),
          result: result as unknown as Prisma.InputJsonObject,
          error: null,
          failedAt: null,
        },
      });

      console.log(`Job completed: ${jobId} (BullMQ ID: ${job.id})`);
      return result;
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
        producerId: job.data.producerId,
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
