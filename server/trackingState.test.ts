import { describe, expect, it } from "vitest";
import { buildProductViewUpdate } from "./trackingState";

describe("buildProductViewUpdate", () => {
  it("promotes a recently viewed search product from low to normal priority", () => {
    const viewedAt = new Date("2026-08-14T08:00:00.000Z");
    expect(buildProductViewUpdate("low", viewedAt)).toEqual({ lastViewedAt: viewedAt, trackingPriority: "normal" });
  });

  it("keeps manual/favorite high priority intact when recording a view", () => {
    const viewedAt = new Date("2026-08-14T08:00:00.000Z");
    expect(buildProductViewUpdate("high", viewedAt)).toEqual({ lastViewedAt: viewedAt, trackingPriority: "high" });
  });
});
