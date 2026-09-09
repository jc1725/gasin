import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const jobs = readFileSync(new URL("./scheduledJobs.ts", import.meta.url), "utf8");
const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("collected price history retention", () => {
  it("keeps collected price observations for 90 days and prunes them with official history", () => {
    expect(jobs).toContain("90 * 24 * 60 * 60 * 1000");
    expect(jobs).toContain("db.pruneCollectedPriceHistory(expiry)");
    expect(db).toContain("lt(collectedPriceHistory.collectedAt, before)");
  });
});
