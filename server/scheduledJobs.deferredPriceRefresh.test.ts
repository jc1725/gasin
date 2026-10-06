import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startSyncRun: vi.fn(), finishSyncRun: vi.fn(), listAllTrackedProducts: vi.fn(), deferSearchProductRefresh: vi.fn(), getSearchApiQuotaStatus: vi.fn(), getDeferredSearchProducts: vi.fn(), recordDeferredSearchRecheckMiss: vi.fn(), recordDeferredSearchRecheckError: vi.fn(), recordPriceTrackingMetric: vi.fn(), markScheduleCompleted: vi.fn(), backfillProductGroupKeys: vi.fn(), searchCatalogSafely: vi.fn(), generatePendingDeepLinks: vi.fn(),
}));

vi.mock("./db", () => ({ startSyncRun: mocks.startSyncRun, finishSyncRun: mocks.finishSyncRun, listAllTrackedProducts: mocks.listAllTrackedProducts, deferSearchProductRefresh: mocks.deferSearchProductRefresh, getSearchApiQuotaStatus: mocks.getSearchApiQuotaStatus, getDeferredSearchProducts: mocks.getDeferredSearchProducts, recordDeferredSearchRecheckMiss: mocks.recordDeferredSearchRecheckMiss, recordDeferredSearchRecheckError: mocks.recordDeferredSearchRecheckError, recordPriceTrackingMetric: mocks.recordPriceTrackingMetric, markScheduleCompleted: mocks.markScheduleCompleted, backfillProductGroupKeys: mocks.backfillProductGroupKeys }));
vi.mock("./catalogSearch", () => ({ searchCatalogSafely: mocks.searchCatalogSafely }));
vi.mock("./coupang", () => ({ COUPANG_BEST_CATEGORY_IDS: [], getBestCategoryProducts: vi.fn(), getCoupangVariantKey: vi.fn(), getGoldBoxProducts: vi.fn() }));
vi.mock("./deepLinks", () => ({ generatePendingDeepLinks: mocks.generatePendingDeepLinks }));
vi.mock("./googleDrivePersonal", () => ({ syncProductsToPersonalGoogleDrive: vi.fn() }));
vi.mock("./coupangRateLimit", () => ({ CoupangRateLimitError: class CoupangRateLimitError extends Error {} }));

import { DEFER_SWEEP_MIN_INTERVAL_MS, PRICE_REFRESH_SEARCH_BATCH_SIZE, recheckDeferredSearchProducts, refreshDeferredSearchPrices, resetDeferSweepState } from "./scheduledJobs";

describe("deferred search price refresh job", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // 2026-10-01: deferred 일괄 표시는 3분 간격으로 throttle되므로 모듈 상태가
    // 테스트 사이에 새면 두 번째 실행부터 listAllTrackedProducts를 건너뛴다.
    resetDeferSweepState();
    mocks.startSyncRun.mockResolvedValue(7);
    mocks.listAllTrackedProducts.mockResolvedValue([{ id: 41, source: "search" }]);
    mocks.deferSearchProductRefresh.mockResolvedValue(1);
    mocks.getSearchApiQuotaStatus.mockResolvedValue({ allowed: true });
    mocks.generatePendingDeepLinks.mockResolvedValue({ processedCount: 1, detail: "새 딥링크 1개를 저장했습니다." });
    // 2026-10-01: 제품 그룹키 백필은 이 3분 주기 작업에 얹혀 있다(server/db.ts).
    mocks.backfillProductGroupKeys.mockResolvedValue({ scannedCount: 0, updatedCount: 0, remaining: false });
    mocks.getDeferredSearchProducts.mockResolvedValue([
      { id: 41, externalProductId: "41:11:22", name: "가격 갱신 상품 A", variantLabel: "혼합색상", unitLabel: "20cm", quantity: 1 },
      { id: 42, externalProductId: "42:33:44", name: "가격 갱신 상품 B" },
    ]);
    const refreshed = { id: 41, externalProductId: "41:11:22", name: "가격 갱신 상품 A", variantLabel: "혼합색상", unitLabel: "20cm", quantity: 1, currentPrice: 10_000 };
    // 2026-09-29: 미일치 상품은 더 짧게 줄인 2차 검색어로 한 번 더 시도한다.
    mocks.searchCatalogSafely
      .mockResolvedValueOnce({ source: "coupang", products: [refreshed] })
      .mockResolvedValue({ source: "coupang", products: [] });
  });

  it("rechecks a safe batch and records attempts even when an exact SKU is unavailable", async () => {
    await expect(refreshDeferredSearchPrices()).resolves.toMatchObject({ processedCount: 2 });
    expect(PRICE_REFRESH_SEARCH_BATCH_SIZE).toBe(30);
    expect(mocks.getDeferredSearchProducts).toHaveBeenCalledWith(30);
    expect(mocks.searchCatalogSafely).toHaveBeenNthCalledWith(1, "가격 갱신 상품 A 20cm 1개", 10, { forceExternal: true, callType: "price-tracking", updateExistingOnly: true });
    expect(mocks.searchCatalogSafely).toHaveBeenNthCalledWith(2, "가격 갱신 상품 B", 10, { forceExternal: true, callType: "price-tracking", updateExistingOnly: true });
    // 2차 검색어는 더 짧은 형태이며, 상품 ID 숫자로는 절대 검색하지 않는다.
    expect(mocks.searchCatalogSafely).toHaveBeenNthCalledWith(3, "가격 갱신 상품", 10, { forceExternal: true, callType: "price-tracking", updateExistingOnly: true });
    for (const [query] of mocks.searchCatalogSafely.mock.calls) expect(query).not.toMatch(/^\d+$/);
    expect(mocks.recordDeferredSearchRecheckMiss).toHaveBeenCalledWith(42, expect.stringContaining("정확 SKU"));
    expect(mocks.generatePendingDeepLinks).toHaveBeenCalledTimes(1);
    expect(mocks.finishSyncRun).toHaveBeenCalledWith(7, "success", 2, expect.stringContaining("fresh 1개"));
  });

  // 2026-09-29: 딥링크 생성 대기는 이 실행과 무관한 경로(수집기 신규 등록, 미일치 상품의
  // 딥링크 유지 등)에서도 계속 쌓인다. 예전에는 이번 실행에서 재확인·유지된 상품이 있을
  // 때만 생성을 호출해서, 조용한 주기가 이어지면 대기 물량이 줄지 않았다.
  it("always drains the pending deep-link queue, even when nothing matched in this run", async () => {
    mocks.searchCatalogSafely.mockReset();
    mocks.searchCatalogSafely
      .mockResolvedValueOnce({ source: "coupang", products: [] })
      .mockResolvedValueOnce({ source: "coupang", products: [] });
    mocks.recordDeferredSearchRecheckMiss.mockResolvedValue("awaiting_collection");

    await refreshDeferredSearchPrices();

    expect(mocks.generatePendingDeepLinks).toHaveBeenCalledTimes(1);
  });

  it("isolates a 400 error in the general deferred recheck and continues to the next product", async () => {
    mocks.searchCatalogSafely.mockReset();
    mocks.searchCatalogSafely
      .mockRejectedValueOnce(new Error("Coupang API error 400: keyword maximum length is 50"))
      .mockResolvedValue({ source: "coupang", products: [] });

    await expect(recheckDeferredSearchProducts()).resolves.toContain("정확 SKU 미일치 1개");
    expect(mocks.recordDeferredSearchRecheckError).toHaveBeenCalledWith(41, "Coupang API error 400: keyword maximum length is 50");
    expect(mocks.recordDeferredSearchRecheckMiss).toHaveBeenCalledWith(42, expect.stringContaining("옵션 SKU"));
    expect(mocks.searchCatalogSafely).toHaveBeenCalledTimes(2);
  });

  it("records one invalid external search as retryable and completes the remaining batch", async () => {
    mocks.searchCatalogSafely.mockReset();
    mocks.searchCatalogSafely
      .mockRejectedValueOnce(new Error("Coupang API error 400: keyword maximum length is 50"))
      .mockResolvedValue({ source: "coupang", products: [] });

    await expect(refreshDeferredSearchPrices()).resolves.toMatchObject({ processedCount: 2 });

    expect(mocks.recordDeferredSearchRecheckError).toHaveBeenCalledWith(41, "Coupang API error 400: keyword maximum length is 50");
    expect(mocks.recordDeferredSearchRecheckMiss).toHaveBeenCalledWith(42, expect.stringContaining("정확 SKU"));
    expect(mocks.finishSyncRun).toHaveBeenCalledWith(7, "success", 2, expect.stringContaining("API 오류 재시도 대기 1개"));
  });
  // 2026-10-01: 가격 재확인이 분당 추적 예산(32회)을 한 실행에 전부 써버려서, 뒤에
  // 호출되던 딥링크 생성이 매 실행 0건이었다(운영 DB: pending 6,034개). 순서를
  // 뒤집어 딥링크가 작은 예약 몫(8회)을 먼저 확보하게 했다.
  it("generates deep links before rechecking prices so the queue is not starved", async () => {
    const order: string[] = [];
    mocks.generatePendingDeepLinks.mockImplementation(async () => {
      order.push("deeplink");
      return { processedCount: 1, detail: "새 딥링크 1개를 저장했습니다." };
    });
    mocks.getDeferredSearchProducts.mockImplementation(async () => {
      order.push("recheck");
      return [];
    });

    await refreshDeferredSearchPrices();

    expect(order).toEqual(["deeplink", "recheck"]);
  });

  // 2026-10-01: 작업 주기를 1분으로 올리면서, 매 실행 첫 줄의 "전체 추적 상품 조회 +
  // deferred 일괄 표시"(상품 3만여 개를 500개씩 UPDATE)는 지금까지와 같은 3분 간격을
  // 유지한다. 시간이 지나야 대상이 늘어나는 성질이라 1분마다 돌릴 이유가 없다.
  it("throttles the deferred-mark sweep so a faster cron does not multiply the DB writes", async () => {
    await refreshDeferredSearchPrices();
    expect(mocks.listAllTrackedProducts).toHaveBeenCalledTimes(1);
    expect(mocks.deferSearchProductRefresh).toHaveBeenCalledTimes(1);

    await refreshDeferredSearchPrices();
    expect(mocks.listAllTrackedProducts).toHaveBeenCalledTimes(1);
    expect(mocks.deferSearchProductRefresh).toHaveBeenCalledTimes(1);

    // 건너뛴 실행에서도 재확인과 딥링크 생성은 그대로 돈다 — 처리량을 늘리는 게 목적이다.
    expect(mocks.getDeferredSearchProducts).toHaveBeenCalledTimes(2);
    expect(mocks.generatePendingDeepLinks).toHaveBeenCalledTimes(2);
  });

  it("sweeps again once the throttle interval has passed", async () => {
    vi.useFakeTimers();
    try {
      await refreshDeferredSearchPrices();
      expect(mocks.deferSearchProductRefresh).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(DEFER_SWEEP_MIN_INTERVAL_MS);
      await refreshDeferredSearchPrices();
      expect(mocks.deferSearchProductRefresh).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  // 2026-10-01: 가격 갱신 대상이 끝없이 늘어나는 문제를 줄이려고, 로켓 계열이 아닌 상품은
  // 찜을 해두었을 때만 갱신한다. 3분 작업이 전체 상품이 아니라 갱신 대상만 받아야 한다.
  it("asks only for refresh-eligible products when marking deferred rechecks", async () => {
    await refreshDeferredSearchPrices();
    expect(mocks.listAllTrackedProducts).toHaveBeenCalledWith({ refreshableOnly: true });
  });
});
