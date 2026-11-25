import { describe, expect, it } from "vitest";
import { buildPriceTrackingPerformanceMetrics, readRowsInPages } from "./db";

describe("price tracking performance metrics", () => {
  const start = new Date("2026-09-01T00:00:00.000Z");
  const now = new Date("2026-09-02T00:00:00.000Z");

  it("calculates average API calls, resolution time, and resolution rates", () => {
    const result = buildPriceTrackingPerformanceMetrics([
      { productId: 1, source: "search", outcome: "unmatched", apiCalls: 2, durationMs: 300, occurredAt: new Date("2026-09-01T02:00:00.000Z") },
      { productId: 1, source: "search", outcome: "matched", apiCalls: 1, durationMs: 200, occurredAt: new Date("2026-09-01T05:00:00.000Z") },
      { productId: 2, source: "search", outcome: "collector_resolved", apiCalls: 1, durationMs: 100, occurredAt: new Date("2026-09-01T06:00:00.000Z") },
      { productId: 3, source: "search", outcome: "api_error", apiCalls: 2, durationMs: 500, occurredAt: new Date("2026-09-01T07:00:00.000Z") },
    ], start, now);

    expect(result.summary.attempts).toBe(4);
    expect(result.summary.uniqueProducts).toBe(3);
    expect(result.summary.unresolvedProducts).toBe(1);
    expect(result.summary.resolvedProducts).toBe(2);
    expect(result.summary.avgApiCallsPerProduct).toBe(1.5);
    expect(result.summary.avgResolutionHours).toBe(3);
    expect(result.summary.successRate).toBe(66.67);
    expect(result.summary.collectorResolutionRate).toBe(33.33);
    expect(result.daily[0]).toMatchObject({ attempts: 4, matched: 1, collectorResolved: 1, unresolved: 1, apiErrors: 1, avgApiCalls: 1.5, successRate: 66.67 });
  });

  it("returns safe empty values when no metrics exist", () => {
    const result = buildPriceTrackingPerformanceMetrics([], start, now);
    expect(result.summary).toMatchObject({ attempts: 0, uniqueProducts: 0, unresolvedProducts: 0, resolvedProducts: 0, avgApiCallsPerProduct: 0, avgResolutionHours: null, successRate: 0, collectorResolutionRate: 0 });
    expect(result.daily).toHaveLength(1);
    expect(result.daily[0].successRate).toBeNull();
  });
});

// 2026-11-25: 7일 통계가 앞의 20,000행에서 잘려 최근 날짜가 0으로 나오던 문제.
describe("price tracking metrics paging", () => {
  const table = Array.from({ length: 45 }, (_, index) => ({ id: index + 1 }));
  const fetchPage = async (afterId: number, pageSize: number) => table.filter(row => row.id > afterId).slice(0, pageSize);

  it("reads every row across pages instead of stopping at the first page", async () => {
    const result = await readRowsInPages(fetchPage, 20, 1000);
    expect(result.rows).toHaveLength(45);
    expect(result.rows[44]!.id).toBe(45);
    expect(result.truncated).toBe(false);
  });

  it("stops at the row cap and reports that the statistics are truncated", async () => {
    const result = await readRowsInPages(fetchPage, 20, 30);
    expect(result.rows).toHaveLength(30);
    expect(result.truncated).toBe(true);
  });

  it("does not report truncation when the last page is exactly full", async () => {
    const result = await readRowsInPages(async (afterId, pageSize) => table.slice(0, 40).filter(row => row.id > afterId).slice(0, pageSize), 20, 1000);
    expect(result.rows).toHaveLength(40);
    expect(result.truncated).toBe(false);
  });
});
