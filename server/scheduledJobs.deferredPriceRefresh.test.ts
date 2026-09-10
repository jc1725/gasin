import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startSyncRun: vi.fn(), finishSyncRun: vi.fn(), listAllTrackedProducts: vi.fn(), deferSearchProductRefresh: vi.fn(), getSearchApiQuotaStatus: vi.fn(), getDeferredSearchProducts: vi.fn(), recordDeferredSearchRecheckMiss: vi.fn(), recordDeferredSearchRecheckError: vi.fn(), recordPriceTrackingMetric: vi.fn(), markScheduleCompleted: vi.fn(), searchCatalogSafely: vi.fn(), generatePendingDeepLinks: vi.fn(),
}));

vi.mock("./db", () => ({ startSyncRun: mocks.startSyncRun, finishSyncRun: mocks.finishSyncRun, listAllTrackedProducts: mocks.listAllTrackedProducts, deferSearchProductRefresh: mocks.deferSearchProductRefresh, getSearchApiQuotaStatus: mocks.getSearchApiQuotaStatus, getDeferredSearchProducts: mocks.getDeferredSearchProducts, recordDeferredSearchRecheckMiss: mocks.recordDeferredSearchRecheckMiss, recordDeferredSearchRecheckError: mocks.recordDeferredSearchRecheckError, recordPriceTrackingMetric: mocks.recordPriceTrackingMetric, markScheduleCompleted: mocks.markScheduleCompleted }));
vi.mock("./catalogSearch", () => ({ searchCatalogSafely: mocks.searchCatalogSafely }));
vi.mock("./coupang", () => ({ COUPANG_BEST_CATEGORY_IDS: [], getBestCategoryProducts: vi.fn(), getCoupangVariantKey: vi.fn(), getGoldBoxProducts: vi.fn() }));
vi.mock("./deepLinks", () => ({ generatePendingDeepLinks: mocks.generatePendingDeepLinks }));
vi.mock("./googleDrivePersonal", () => ({ syncProductsToPersonalGoogleDrive: vi.fn() }));
vi.mock("./coupangRateLimit", () => ({ CoupangRateLimitError: class CoupangRateLimitError extends Error {} }));

import { PRICE_REFRESH_SEARCH_BATCH_SIZE, recheckDeferredSearchProducts, refreshDeferredSearchPrices } from "./scheduledJobs";

describe("deferred search price refresh job", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.startSyncRun.mockResolvedValue(7);
    mocks.listAllTrackedProducts.mockResolvedValue([{ id: 41, source: "search" }]);
    mocks.deferSearchProductRefresh.mockResolvedValue(1);
    mocks.getSearchApiQuotaStatus.mockResolvedValue({ allowed: true });
    mocks.generatePendingDeepLinks.mockResolvedValue({ processedCount: 1, detail: "새 딥링크 1개를 저장했습니다." });
    mocks.getDeferredSearchProducts.mockResolvedValue([
      { id: 41, externalProductId: "41:11:22", name: "가격 갱신 상품 A", variantLabel: "혼합색상", unitLabel: "20cm", quantity: 1 },
      { id: 42, externalProductId: "42:33:44", name: "가격 갱신 상품 B" },
    ]);
    const refreshed = { id: 41, externalProductId: "41:11:22", name: "가격 갱신 상품 A", variantLabel: "혼합색상", unitLabel: "20cm", quantity: 1, currentPrice: 10_000 };
    mocks.searchCatalogSafely
      .mockResolvedValueOnce({ source: "coupang", products: [refreshed] })
      .mockResolvedValueOnce({ source: "coupang", products: [] });
  });

  it("rechecks a safe batch and records attempts even when an exact SKU is unavailable", async () => {
    await expect(refreshDeferredSearchPrices()).resolves.toMatchObject({ processedCount: 2 });
    expect(PRICE_REFRESH_SEARCH_BATCH_SIZE).toBe(30);
    expect(mocks.getDeferredSearchProducts).toHaveBeenCalledWith(30);
    expect(mocks.searchCatalogSafely).toHaveBeenNthCalledWith(1, "가격 갱신 상품 A 20cm 1개", 10, { forceExternal: true, callType: "price-tracking" });
    expect(mocks.searchCatalogSafely).toHaveBeenNthCalledWith(2, "가격 갱신 상품 B", 10, { forceExternal: true, callType: "price-tracking" });
    expect(mocks.recordDeferredSearchRecheckMiss).toHaveBeenCalledWith(42, expect.stringContaining("정확 SKU"));
    expect(mocks.generatePendingDeepLinks).toHaveBeenCalledTimes(1);
    expect(mocks.finishSyncRun).toHaveBeenCalledWith(7, "success", 2, expect.stringContaining("fresh 1개"));
  });

  it("isolates a 400 error in the general deferred recheck and continues to the next product", async () => {
    mocks.searchCatalogSafely.mockReset();
    mocks.searchCatalogSafely
      .mockRejectedValueOnce(new Error("Coupang API error 400: keyword maximum length is 50"))
      .mockResolvedValueOnce({ source: "coupang", products: [] });

    await expect(recheckDeferredSearchProducts()).resolves.toContain("정확 SKU 미일치 1개");
    expect(mocks.recordDeferredSearchRecheckError).toHaveBeenCalledWith(41, "Coupang API error 400: keyword maximum length is 50");
    expect(mocks.recordDeferredSearchRecheckMiss).toHaveBeenCalledWith(42, expect.stringContaining("옵션 SKU"));
    expect(mocks.searchCatalogSafely).toHaveBeenCalledTimes(2);
  });

  it("records one invalid external search as retryable and completes the remaining batch", async () => {
    mocks.searchCatalogSafely.mockReset();
    mocks.searchCatalogSafely
      .mockRejectedValueOnce(new Error("Coupang API error 400: keyword maximum length is 50"))
      .mockResolvedValueOnce({ source: "coupang", products: [] });

    await expect(refreshDeferredSearchPrices()).resolves.toMatchObject({ processedCount: 2 });

    expect(mocks.recordDeferredSearchRecheckError).toHaveBeenCalledWith(41, "Coupang API error 400: keyword maximum length is 50");
    expect(mocks.recordDeferredSearchRecheckMiss).toHaveBeenCalledWith(42, expect.stringContaining("정확 SKU"));
    expect(mocks.finishSyncRun).toHaveBeenCalledWith(7, "success", 2, expect.stringContaining("API 오류 재시도 대기 1개"));
  });
});
