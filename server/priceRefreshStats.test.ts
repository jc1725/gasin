import { describe, expect, it } from "vitest";
import { buildPriceRefreshStats } from "./priceRefreshStats";

describe("buildPriceRefreshStats", () => {
  it("aggregates only the latest 24 hours and calculates completed-run success rate", () => {
    const now = new Date("2026-08-25T12:30:00.000Z");
    const stats = buildPriceRefreshStats([
      { status: "success", processedCount: 12, startedAt: new Date("2026-08-25T12:01:00.000Z"), finishedAt: new Date("2026-08-25T12:02:00.000Z") },
      { status: "failed", processedCount: 3, startedAt: new Date("2026-08-25T11:01:00.000Z"), finishedAt: new Date("2026-08-25T11:02:00.000Z") },
      { status: "running", processedCount: 0, startedAt: new Date("2026-08-25T10:01:00.000Z"), finishedAt: null },
      { status: "success", processedCount: 99, startedAt: new Date("2026-08-24T11:00:00.000Z"), finishedAt: new Date("2026-08-24T11:01:00.000Z") },
    ], now);

    expect(stats.summary).toEqual({ totalRuns: 3, successfulRuns: 1, failedRuns: 1, runningRuns: 1, processedCount: 15, successRate: 50 });
    expect(stats.hourly).toHaveLength(24);
    expect(stats.hourly.find(bucket => bucket.startedAt.toISOString() === "2026-08-25T12:00:00.000Z")).toMatchObject({ runs: 1, processedCount: 12, successRate: 100 });
    expect(stats.hourly.find(bucket => bucket.startedAt.toISOString() === "2026-08-25T10:00:00.000Z")).toMatchObject({ runs: 1, successRate: null });
  });
});
