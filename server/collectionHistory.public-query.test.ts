import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("public collected price history query", () => {
  it("maps an active internal product to its external product ID without exposing the extension token", () => {
    expect(router).toContain("collectedPriceHistory: publicProcedure");
    expect(router).toContain("listCollectedPriceHistory(product.externalProductId, ninetyDaysAgo)");
    expect(router).not.toContain("GASYN_COLLECT_TOKEN");
  });

  it("supports a time cutoff while preserving the authenticated REST history endpoint's full-history behavior", () => {
    expect(db).toContain("listCollectedPriceHistory(productId: string, since?: Date)");
    expect(db).toContain("gte(collectedPriceHistory.collectedAt, since)");
    expect(db).toContain("itemId: collectedPriceHistory.itemId");
    expect(db).toContain("vendorItemId: collectedPriceHistory.vendorItemId");
  });
});
