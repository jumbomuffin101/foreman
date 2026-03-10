import { Prisma } from "@prisma/client";
import { Router, Request, Response, NextFunction } from "express";
import prisma from "../../lib/prisma";
import { jobQueue } from "../../lib/queue";

interface CreateJobBody {
  type?: string;
  payload?: Prisma.InputJsonObject;
}

interface JobsQuery {
  status?: string;
}

const router = Router();

router.post(
  "/",
  async (
    req: Request<Record<string, never>, unknown, CreateJobBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { type, payload } = req.body;

      if (!type || !payload || typeof payload !== "object" || Array.isArray(payload)) {
        res.status(400).json({ error: "Both type and payload are required." });
        return;
      }

      const createdJob = await prisma.job.create({
        data: {
          type,
          payload,
          status: "waiting",
        },
      });

      const bullJob = await jobQueue.add(type, {
        jobId: createdJob.id,
        type,
        payload,
      });

      res.status(201).json({
        jobId: createdJob.id,
        bullJobId: bullJob.id,
        status: "waiting",
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:id",
  async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const job = await prisma.job.findUnique({ where: { id: req.params.id } });

      if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
      }

      res.status(200).json(job);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/",
  async (
    req: Request<Record<string, never>, unknown, unknown, JobsQuery>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { status } = req.query;

      const jobs = await prisma.job.findMany({
        where: status ? { status } : undefined,
        orderBy: { createdAt: "desc" },
      });

      res.status(200).json(jobs);
    } catch (error) {
      next(error);
    }
  },
);

export default router;