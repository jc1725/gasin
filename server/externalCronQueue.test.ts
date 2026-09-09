import { describe, expect, it } from "vitest";
import { summarizeExternalCronQueue } from "./externalCronQueue";

describe("summarizeExternalCronQueue", () => {
  it("separates immediately due cron candidates from scheduled and excluded deferred products", () => {
    const now = new Date("2026-08-25T14:00:00.000Z");
    expect(summarizeExternalCronQueue([
      { source: "search", refreshState: "deferred", isActive: true, inStock: true, nextRefreshAt: null },
      { source: "search", refreshState: "deferred", isActive: true, inStock: true, nextRefreshAt: new Date("2026-08-25T15:00:00.000Z") },
      { source: "search", refreshState: "deferred", isActive: true, inStock: false, nextRefreshAt: null },
      { source: "search", refreshState: "deferred", isActive: false, inStock: true, nextRefreshAt: null },
      { source: "collection", refreshState: "deferred", isActive: true, inStock: true, nextRefreshAt: null },
      { source: "search", refreshState: "awaiting_collection", isActive: true, inStock: true, nextRefreshAt: null },
      { source: "search", refreshState: "awaiting_collection", isActive: false, inStock: true, nextRefreshAt: null },
      { source: "search", refreshState: "awaiting_collection", isActive: true, inStock: false, nextRefreshAt: null },
    ], now)).toEqual({ dueNow: 1, scheduledLater: 1, awaitingCollection: 1, excludedSoldOut: 2, excludedInactive: 2, excludedNonSearch: 1, excludedTotal: 5 });
  });
});
