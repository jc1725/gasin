import { describe, expect, it } from "vitest";
import { buildPriceTrackingPerformanceMetrics } from "./db";

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
