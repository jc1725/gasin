import { describe, expect, it } from "vitest";
import { classifyDeferredPriceInputs } from "./deferredPriceInput";

describe("classifyDeferredPriceInputs", () => {
  it("excludes automatic queues, collector-observed, and recently confirmed products from the manual input count", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    const result = classifyDeferredPriceInputs([
      { id: 1, source: "search", lastRefreshReason: "Search API 시간당 예산 보호를 위해 정기 재검색을 보류합니다." },
      { id: 2, source: "search", lastRefreshReason: "가신 수집기 최신 관측 반영" },
      { id: 3, source: "search", lastRefreshReason: "승인된 Search API 결과에서 정확 SKU를 찾지 못했습니다." },
      { id: 4, source: "search", lastRefreshReason: "관리자 확인 필요" },
      { id: 5, source: "search", lastRefreshReason: "전체 가격 추적 초기 대기열: 24시간 경과 상품을 매분 최대 8개씩 재확인" },
      { id: 6, source: "search", lastRefreshReason: "관리자 전체 가격 재확인 대기열 등록" },
      { id: 7, source: "search", lastRefreshReason: "관리자 직접 확인이 필요합니다." },
    ], [{ productId: 4, checkedAt: new Date("2026-08-25T01:00:00.000Z") }], now);

    expect(result.summary).toEqual({ totalDeferred: 7, manualInputRequired: 1, automaticRecheck: 4, collectorObserved: 1, recentlyConfirmed: 1, skuMismatch: 1 });
    expect([...result.manualProductIds]).toEqual([7]);
    expect([...result.automaticProductIds]).toEqual([1, 2, 3, 5, 6]);
  });
});
