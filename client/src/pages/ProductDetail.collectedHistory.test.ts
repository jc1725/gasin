import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./ProductDetail.tsx", import.meta.url), "utf8");
const chart = readFileSync(new URL("../components/PriceHistoryChart.tsx", import.meta.url), "utf8");

describe("product detail unified price chart", () => {
  it("queries collected price history and renders one unified low-price series", () => {
    expect(page).toContain("trpc.catalog.collectedPriceHistory.useQuery");
    expect(page).toContain("collapsePriceHistoryToDailyLow(mergedHistory)");
    expect(page).toContain("PriceHistoryChart");
    expect(page).toContain("Suspense fallback");
    expect(chart).toContain('dataKey="price"');
    expect(page).not.toContain('dataKey="extensionPrice"');
    expect(page).not.toContain("확장 프로그램 수집");
  });

  it("uses the unified daily lows for the 90-day minimum", () => {
    expect(page).toContain("getLowestPrice(dailyLowestHistory, product.lowestPrice)");
  });

  it("applies sold-out status to every product detail without a product-specific condition", () => {
    expect(page).toContain("product.inStock ? won(product.currentPrice) : \"품절\"");
    expect(page).toContain("getRecentSoldOutObservations(collectedHistory)");
    expect(page).toContain("품절 확인 이력");
    expect(page).not.toContain("19650029");
    expect(page).not.toContain("8669576280");
  });
});
