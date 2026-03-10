import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";

export const runtime = "nodejs";

type RecentJob = Awaited<ReturnType<typeof prisma.job.findMany>>[number];

interface StatsResponse {
  total: number;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  dead: number;
  throughputLast5Min: number;
  avgProcessingTimeMs: number;
  recentJobs: RecentJob[];
}

export async function GET(): Promise<NextResponse<StatsResponse | { error: string }>> {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const [
      total,
      waiting,
      active,
      completed,
      failed,
      dead,
      throughputLast5Min,
      recentJobs,
      completedWithTimes,
    ] = await Promise.all([
      prisma.job.count(),
      prisma.job.count({ where: { status: "waiting" } }),
      prisma.job.count({ where: { status: "active" } }),
      prisma.job.count({ where: { status: "completed" } }),
      prisma.job.count({ where: { status: "failed" } }),
      prisma.job.count({ where: { status: "dead" } }),
      prisma.job.count({
        where: {
          status: "completed",
          processedAt: {
            gte: fiveMinutesAgo,
          },
        },
      }),
      prisma.job.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.job.findMany({
        where: {
          status: "completed",
          startedAt: { not: null },
          processedAt: { not: null },
        },
        select: {
          startedAt: true,
          processedAt: true,
        },
      }),
    ]);

    const totalDuration = completedWithTimes.reduce((acc, item) => {
      if (!item.startedAt || !item.processedAt) {
        return acc;
      }

      return acc + (item.processedAt.getTime() - item.startedAt.getTime());
    }, 0);

    const avgProcessingTimeMs =
      completedWithTimes.length > 0 ? Math.round(totalDuration / completedWithTimes.length) : 0;

    return NextResponse.json({
      total,
      waiting,
      active,
      completed,
      failed,
      dead,
      throughputLast5Min,
      avgProcessingTimeMs,
      recentJobs,
    });
  } catch (error) {
    console.error("Failed to fetch dashboard stats:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard stats" }, { status: 500 });
  }
}