import { describe, expect, it, vi } from "vitest";
import {
  buildPriceRefreshQueryVariants,
  findSkuWithFallbackQueries,
  scoreSkuCandidate,
} from "./multiStageSkuMatcher";

describe("multi-stage SKU matcher", () => {
  const stored = {
    externalProductId: "5727587582:9600466634:76884981035",
    name: "맥스클리닉 퓨리티톡 브라이트닝 클렌징 오일 폼",
    variantLabel: "310g, 1개",
    unitLabel: "310g",
    quantity: 1,
    packSize: null,
    isRocket: true,
    isFreeShipping: true,
  };

  it("builds at most two 50-character search queries with option evidence", () => {
    const queries = buildPriceRefreshQueryVariants(stored);
    expect(queries.length).toBeLessThanOrEqual(2);
    expect(queries.every(query => query.length <= 50)).toBe(true);
    expect(queries[0]).toContain("310g");
    expect(queries[0]).toContain("1개");
  });

  it("keeps the option-aware query in the bounded two-query budget", () => {
    const queries = buildPriceRefreshQueryVariants({ ...stored, unitLabel: null, quantity: null, variantLabel: "310g, 1개" });
    expect(queries[1]).toContain("310g");
    expect(queries[1]).toContain("1개");
  });

  it("gives the exact three-part SKU the highest confidence", () => {
    const scored = scoreSkuCandidate(stored, {
      ...stored,
      name: stored.name,
    });
    expect(scored.exactSku).toBe(true);
    expect(scored.score).toBeGreaterThan(90);
    expect(scored.reasons[0]).toContain("전체 일치");
  });

  it("uses a second query only when the first query does not find the exact SKU", async () => {
    const search = vi.fn()
      .mockResolvedValueOnce({ source: "coupang", products: [] })
      .mockResolvedValueOnce({ source: "coupang", products: [{ ...stored }] });

    const result = await findSkuWithFallbackQueries(stored, search);
    expect(search).toHaveBeenCalledTimes(2);
    expect(result.exact?.product.externalProductId).toBe(stored.externalProductId);
  });

  it("uses productId detail revalidation as the bounded second stage", async () => {
    const search = vi.fn().mockResolvedValue({ source: "coupang", products: [] });
    const detail = vi.fn().mockResolvedValue({ source: "coupang", products: [{ ...stored }] });

    const result = await findSkuWithFallbackQueries(stored, search, async productId => {
      expect(productId).toBe("5727587582");
      return detail(productId);
    });

    expect(search).toHaveBeenCalledTimes(1);
    expect(detail).toHaveBeenCalledTimes(1);
    expect(result.exact?.product.externalProductId).toBe(stored.externalProductId);
  });

  it("does not auto-accept a productId-only candidate", async () => {
    const search = vi.fn().mockResolvedValue({
      source: "coupang",
      products: [{
        ...stored,
        externalProductId: "5727587582:other-item:other-vendor",
      }],
    });

    const result = await findSkuWithFallbackQueries(stored, search);
    expect(result.exact).toBeNull();
    expect(result.best?.exactSku).toBe(false);
  });
});
