"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface DashboardJob {
  id: string;
  type: string;
  producerId: string | null;
  status: string;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  processedAt: string | null;
}

interface StatsResponse {
  total: number;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  dead: number;
  throughputLast5Min: number;
  avgProcessingTimeMs: number;
  byType: {
    email: number;
    report: number;
    unknown: number;
  };
  recentJobs: DashboardJob[];
}

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString();
};

const formatDuration = (ms: number): string => {
  if (ms <= 0) {
    return "-";
  }

  if (ms < 1000) {
    return `${ms} ms`;
  }

  return `${(ms / 1000).toFixed(2)} s`;
};

const getStatusBadgeClass = (status: string): string => {
  switch (status) {
    case "waiting":
      return "bg-gray-600 text-gray-100";
    case "active":
      return "bg-blue-600 text-blue-100";
    case "completed":
      return "bg-green-600 text-green-100";
    case "failed":
      return "bg-red-600 text-red-100";
    case "dead":
      return "bg-black text-white border border-gray-700";
    default:
      return "bg-gray-700 text-gray-100";
  }
};

const getBarWidthClass = (count: number, maxCount: number): string => {
  if (maxCount <= 0 || count <= 0) {
    return "w-0";
  }

  const ratio = count / maxCount;

  if (ratio >= 1) {
    return "w-full";
  }

  if (ratio >= 0.75) {
    return "w-3/4";
  }

  if (ratio >= 0.5) {
    return "w-1/2";
  }

  if (ratio >= 0.25) {
    return "w-1/4";
  }

  return "w-1/12";
};

export default function QueueStats() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  const fetchStats = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/stats", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.status}`);
      }

      const data: StatsResponse = (await response.json()) as StatsResponse;
      setStats(data);
      setError(null);
      setLastUpdatedAt(new Date());
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Unknown fetch error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();

    const fetchInterval = setInterval(() => {
      void fetchStats();
    }, 5000);

    return () => {
      clearInterval(fetchInterval);
    };
  }, [fetchStats]);

  useEffect(() => {
    const ticker = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      clearInterval(ticker);
    };
  }, []);

  const secondsAgo = useMemo(() => {
    if (!lastUpdatedAt) {
      return null;
    }

    return Math.max(0, Math.floor((now - lastUpdatedAt.getTime()) / 1000));
  }, [lastUpdatedAt, now]);

  const jobsByTypeRows = useMemo(
    () => [
      { key: "email", label: "Email", count: stats?.byType.email ?? 0, colorClass: "bg-cyan-500" },
      { key: "report", label: "Report", count: stats?.byType.report ?? 0, colorClass: "bg-emerald-500" },
      {
        key: "unknown",
        label: "Unknown",
        count: stats?.byType.unknown ?? 0,
        colorClass: "bg-rose-500",
      },
    ],
    [stats],
  );

  const maxJobsByType = useMemo(
    () => Math.max(1, ...jobsByTypeRows.map((row) => row.count)),
    [jobsByTypeRows],
  );

  if (loading && !stats) {
    return (
      <section className="rounded-xl border border-gray-800 bg-panel p-6 shadow-lg shadow-black/30">
        <p className="text-gray-300">Loading queue stats...</p>
      </section>
    );
  }

  if (error && !stats) {
    return (
      <section className="rounded-xl border border-red-800 bg-panel p-6 shadow-lg shadow-black/30">
        <p className="text-red-300">Error loading stats: {error}</p>
      </section>
    );
  }

  if (!stats) {
    return (
      <section className="rounded-xl border border-gray-800 bg-panel p-6 shadow-lg shadow-black/30">
        <p className="text-gray-300">No stats available.</p>
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-xl border border-gray-800 bg-panel p-6 shadow-2xl shadow-black/40">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h2 className="text-xl font-semibold">Queue Overview</h2>
        <p className="text-sm text-gray-400">
          Last updated: {secondsAgo === null ? "-" : `${secondsAgo} seconds ago`}
        </p>
      </div>

      {error ? <p className="text-sm text-red-300">Refresh error: {error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Total", value: stats.total },
          { label: "Waiting", value: stats.waiting },
          { label: "Active", value: stats.active },
          { label: "Completed", value: stats.completed },
          { label: "Failed", value: stats.failed },
          { label: "DLQ Depth", value: stats.dead },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-gray-700 bg-canvas p-4">
            <p className="text-sm text-gray-400">{item.label}</p>
            <p className="mt-2 text-2xl font-bold text-gray-100">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-700 bg-canvas p-4">
        <h3 className="text-sm font-medium text-gray-200">Jobs by Type</h3>
        <div className="mt-4 space-y-3">
          {jobsByTypeRows.map((row) => (
            <div key={row.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-300">
                <span>{row.label}</span>
                <span>{row.count}</span>
              </div>
              <div className="h-2 w-full rounded bg-gray-800">
                <div
                  className={`h-2 rounded ${row.colorClass} ${getBarWidthClass(row.count, maxJobsByType)}`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-gray-700 bg-canvas p-4">
          <p className="text-sm text-gray-400">Throughput (last 5 minutes)</p>
          <p className="mt-2 text-2xl font-bold text-gray-100">{stats.throughputLast5Min} jobs/5min</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-canvas p-4">
          <p className="text-sm text-gray-400">Avg Processing Time</p>
          <p className="mt-2 text-2xl font-bold text-gray-100">{formatDuration(stats.avgProcessingTimeMs)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="min-w-full divide-y divide-gray-700 text-left text-sm">
          <thead className="bg-canvas text-gray-300">
            <tr>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Producer</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Attempts</th>
              <th className="px-4 py-3 font-medium">Created At</th>
              <th className="px-4 py-3 font-medium">Processing Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 bg-panel text-gray-200">
            {stats.recentJobs.map((job) => {
              const processingMs =
                job.startedAt && job.processedAt
                  ? new Date(job.processedAt).getTime() - new Date(job.startedAt).getTime()
                  : 0;

              return (
                <tr key={job.id}>
                  <td className="px-4 py-3 font-mono text-xs">{job.id}</td>
                  <td className="px-4 py-3">{job.type}</td>
                  <td className="px-4 py-3">{job.producerId ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusBadgeClass(job.status)}`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{job.attempts}</td>
                  <td className="px-4 py-3">{formatDate(job.createdAt)}</td>
                  <td className="px-4 py-3">{formatDuration(processingMs)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
