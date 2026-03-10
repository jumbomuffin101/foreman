import dotenv from "dotenv";

dotenv.config();

interface SeedJob {
  type: string;
  producerId: "producer-a" | "producer-b" | "producer-c";
  payload: Record<string, string>;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3001";

const buildSeedJobs = (): SeedJob[] => {
  try {
    const producerIds: Array<SeedJob["producerId"]> = ["producer-a", "producer-b", "producer-c"];
    const jobs: SeedJob[] = [];

    for (let i = 1; i <= 8; i += 1) {
      jobs.push({
        type: "email",
        producerId: producerIds[(i - 1) % producerIds.length],
        payload: {
          to: `user${i}@example.com`,
          subject: `Foreman email ${i}`,
          body: `This is seeded email payload #${i}.`,
        },
      });
    }

    for (let i = 1; i <= 7; i += 1) {
      jobs.push({
        type: "report",
        producerId: producerIds[(i + 1) % producerIds.length],
        payload: {
          userId: `user-${i}`,
          reportType: i % 2 === 0 ? "weekly" : "monthly",
        },
      });
    }

    for (let i = 1; i <= 5; i += 1) {
      jobs.push({
        type: `unknown-${i}`,
        producerId: producerIds[(i + 2) % producerIds.length],
        payload: {
          note: `Unknown seeded job #${i}`,
        },
      });
    }

    return jobs;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown seed-build error";
    throw new Error(`Failed to build seed jobs: ${message}`);
  }
};

const submitSeedJobs = async (): Promise<void> => {
  try {
    const jobs = buildSeedJobs();

    for (let i = 0; i < jobs.length; i += 1) {
      const job = jobs[i];

      try {
        const response = await fetch(`${API_BASE_URL}/api/jobs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(job),
        });

        const result = (await response.json()) as Record<string, unknown>;

        console.log(
          `[${i + 1}/${jobs.length}] ${job.type} (${job.producerId}) -> ${response.status}`,
          result,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown submission error";
        console.error(`[${i + 1}/${jobs.length}] ${job.type} (${job.producerId}) -> failed`, message);
      }

      await sleep(200);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown seed run error";
    console.error(`Seed run failed: ${message}`);
    process.exit(1);
  }
};

void submitSeedJobs();
