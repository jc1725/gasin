const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type PriceRefreshRun = {
  status: "running" | "success" | "failed";
  processedCount: number;
  startedAt: Date;
  finishedAt: Date | null;
};

export function buildPriceRefreshStats(runs: PriceRefreshRun[], now = new Date()) {
  const windowStartedAt = new Date(now.getTime() - DAY_MS);
  const currentHour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  const bucketStarts = Array.from({ length: 24 }, (_, index) => currentHour - (23 - index) * HOUR_MS);
  const buckets = new Map(bucketStarts.map(start => [start, { startedAt: new Date(start), runs: 0, successfulRuns: 0, failedRuns: 0, processedCount: 0 }]));
  const eligible = runs.filter(run => run.startedAt >= windowStartedAt && run.startedAt <= now);

  for (const run of eligible) {
    const bucket = buckets.get(Math.floor(run.startedAt.getTime() / HOUR_MS) * HOUR_MS);
    if (!bucket) continue;
    bucket.runs += 1;
    bucket.processedCount += Math.max(0, run.processedCount);
    if (run.status === "success") bucket.successfulRuns += 1;
    if (run.status === "failed") bucket.failedRuns += 1;
  }

  const successfulRuns = eligible.filter(run => run.status === "success").length;
  const failedRuns = eligible.filter(run => run.status === "failed").length;
  const runningRuns = eligible.filter(run => run.status === "running").length;
  const completedRuns = successfulRuns + failedRuns;
  const successRate = completedRuns > 0 ? Math.round(successfulRuns / completedRuns * 1_000) / 10 : 0;

  return {
    windowStartedAt,
    windowEndedAt: now,
    summary: {
      totalRuns: eligible.length,
      successfulRuns,
      failedRuns,
      runningRuns,
      processedCount: eligible.reduce((sum, run) => sum + Math.max(0, run.processedCount), 0),
      successRate,
    },
    hourly: Array.from(buckets.values()).map(bucket => {
      const completed = bucket.successfulRuns + bucket.failedRuns;
      return { ...bucket, successRate: completed > 0 ? Math.round(bucket.successfulRuns / completed * 1_000) / 10 : null };
    }),
  };
}
