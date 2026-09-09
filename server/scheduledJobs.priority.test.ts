import { describe, expect, it } from "vitest";
import { selectPrioritizedGoldBoxKeys } from "./scheduledJobs";

describe("selectPrioritizedGoldBoxKeys", () => {
  it("selects GoldBox items from the oldest price confirmation first", () => {
    const selected = selectPrioritizedGoldBoxKeys([
      { source: "goldbox" as const, trackingPriority: "normal" as const, lastSeenAt: new Date("2026-08-14T01:00:00Z"), lastViewedAt: null, externalProductId: "normal" },
      { source: "search" as const, trackingPriority: "high" as const, lastSeenAt: new Date("2026-08-14T03:00:00Z"), lastViewedAt: null, externalProductId: "search-high" },
      { source: "goldbox" as const, trackingPriority: "high" as const, lastSeenAt: new Date("2026-08-14T00:00:00Z"), lastViewedAt: new Date("2026-08-14T01:00:00Z"), externalProductId: "high-old" },
      { source: "goldbox" as const, trackingPriority: "high" as const, lastSeenAt: new Date("2026-08-14T02:00:00Z"), lastViewedAt: new Date("2026-08-14T03:00:00Z"), externalProductId: "high-new" },
    ]);
    expect(selected).toEqual(["high-old", "normal", "high-new"]);
  });
});
