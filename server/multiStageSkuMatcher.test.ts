import { describe, expect, it, vi } from "vitest";
import {
  buildPriceRefreshQueryVariants,
  findSkuWithFallbackQueries,
  PRICE_REFRESH_CORE_NAME_TOKENS,
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

  // 2026-09-29: 긴 상품명 그대로 검색하면 결과가 거의 안 나와서, 두 검색어 모두 핵심
  // 단어만 남긴 짧은 형태로 바꿨다. 2차는 1차보다 더 짧고 용량만 덧붙인다.
  it("keeps both queries short, with the second one shorter than the first", () => {
    const queries = buildPriceRefreshQueryVariants({ ...stored, unitLabel: null, quantity: null, variantLabel: "310g, 1개" });
    expect(queries[0].split(" ").length).toBeLessThanOrEqual(PRICE_REFRESH_CORE_NAME_TOKENS + 2);
    expect(queries[1]).toContain("310g");
    expect(queries[1].length).toBeLessThan(queries[0].length);
    expect(queries[1]).not.toContain(stored.name);
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

  // 2026-09-29: 상품 ID 숫자를 검색어로 넣던 2차 재조회를 없앴다. 쿠팡 검색은 숫자 ID를
  // 일반 키워드로 취급해 적중률이 낮았고, 상품당 API 호출만 2배가 됐다.
  it("never searches by the numeric productId", async () => {
    const search = vi.fn().mockResolvedValue({ source: "coupang", products: [] });

    await findSkuWithFallbackQueries(stored, search);

    for (const [query] of search.mock.calls) expect(query).not.toBe("5727587582");
    expect(search).toHaveBeenCalledTimes(2);
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
