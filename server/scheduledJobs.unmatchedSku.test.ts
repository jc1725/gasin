import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startSyncRun: vi.fn(),
  finishSyncRun: vi.fn(),
  listAllTrackedProducts: vi.fn(),
  getTrackingPrioritySummary: vi.fn(),
  getSearchApiQuotaStatus: vi.fn(),
  deferSearchProductRefresh: vi.fn(),
  upsertCoupangProducts: vi.fn(),
  activateManualTracksForKnownProducts: vi.fn(),
  getNextWaitingManualLink: vi.fn(),
  setManualLinkWaitingError: vi.fn(),
  getDeferredSearchProducts: vi.fn(),
  recordDeferredSearchRecheckMiss: vi.fn(),
  markScheduleCompleted: vi.fn(),
  getGoogleDriveSnapshotConnection: vi.fn(),
  saveGoogleDriveSnapshotFile: vi.fn(),
  getGoldBoxProducts: vi.fn(),
  getCoupangVariantKey: vi.fn(),
  generatePendingDeepLinks: vi.fn(),
  searchCatalogSafely: vi.fn(),
  syncProductsToPersonalGoogleDrive: vi.fn(),
}));

vi.mock("./db", () => ({
  startSyncRun: mocks.startSyncRun,
  finishSyncRun: mocks.finishSyncRun,
  listAllTrackedProducts: mocks.listAllTrackedProducts,
  getTrackingPrioritySummary: mocks.getTrackingPrioritySummary,
  getSearchApiQuotaStatus: mocks.getSearchApiQuotaStatus,
  deferSearchProductRefresh: mocks.deferSearchProductRefresh,
  upsertCoupangProducts: mocks.upsertCoupangProducts,
  activateManualTracksForKnownProducts: mocks.activateManualTracksForKnownProducts,
  getNextWaitingManualLink: mocks.getNextWaitingManualLink,
  setManualLinkWaitingError: mocks.setManualLinkWaitingError,
  getDeferredSearchProducts: mocks.getDeferredSearchProducts,
  recordDeferredSearchRecheckMiss: mocks.recordDeferredSearchRecheckMiss,
  markScheduleCompleted: mocks.markScheduleCompleted,
  getGoogleDriveSnapshotConnection: mocks.getGoogleDriveSnapshotConnection,
  saveGoogleDriveSnapshotFile: mocks.saveGoogleDriveSnapshotFile,
}));
vi.mock("./coupang", () => ({ COUPANG_BEST_CATEGORY_IDS: [], getBestCategoryProducts: vi.fn(), getGoldBoxProducts: mocks.getGoldBoxProducts, getCoupangVariantKey: mocks.getCoupangVariantKey }));
vi.mock("./deepLinks", () => ({ generatePendingDeepLinks: mocks.generatePendingDeepLinks }));
vi.mock("./catalogSearch", () => ({ searchCatalogSafely: mocks.searchCatalogSafely }));
vi.mock("./googleDrivePersonal", () => ({ syncProductsToPersonalGoogleDrive: mocks.syncProductsToPersonalGoogleDrive }));

import { findUnmatchedGoldBoxKeys, refreshTrackedPrices } from "./scheduledJobs";

describe("GoldBox option SKU refresh gaps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.startSyncRun.mockResolvedValue(17);
    mocks.getSearchApiQuotaStatus.mockResolvedValue({ allowed: true });
    mocks.getTrackingPrioritySummary.mockResolvedValue({ high: 1, normal: 0, low: 0 });
    mocks.listAllTrackedProducts.mockResolvedValue([{ source: "goldbox", trackingPriority: "high", lastSeenAt: new Date(), lastViewedAt: null, externalProductId: "sku-missing" }]);
    mocks.getGoldBoxProducts.mockResolvedValue([{ externalProductId: "sku-returned" }]);
    mocks.getCoupangVariantKey.mockImplementation((product: { externalProductId: string }) => product.externalProductId);
    mocks.deferSearchProductRefresh.mockResolvedValue(0);
    mocks.upsertCoupangProducts.mockResolvedValue([]);
    mocks.generatePendingDeepLinks.mockResolvedValue({ detail: "딥링크 대기 없음" });
    mocks.activateManualTracksForKnownProducts.mockResolvedValue(1);
    mocks.getDeferredSearchProducts.mockResolvedValue([]);
    mocks.getGoogleDriveSnapshotConnection.mockResolvedValue({ userId: 7, refreshTokenCiphertext: "ciphertext", folderId: "root", snapshotFileId: null });
    mocks.saveGoogleDriveSnapshotFile.mockResolvedValue(undefined);
    mocks.syncProductsToPersonalGoogleDrive.mockResolvedValue({ fileId: "drive-file", action: "created" });
  });

  it("identifies selected option SKUs absent from the latest approved response", () => {
    expect(findUnmatchedGoldBoxKeys(new Set(["sku-a", "sku-b"]), [{ externalProductId: "sku-b" }])).toEqual(["sku-a"]);
  });

  it("records an unmatched-SKU retry policy without forcing a Search API call", async () => {
    await expect(refreshTrackedPrices()).resolves.toMatchObject({ processedCount: 0 });
    expect(mocks.finishSyncRun).toHaveBeenCalledWith(17, "success", 0, expect.stringContaining("옵션 SKU 1개(sku-missing)는 다음 승인된 GoldBox 응답에서 재매칭하며 Search API로 강제 재조회하지 않았습니다."));
    expect(mocks.syncProductsToPersonalGoogleDrive).toHaveBeenCalledWith(expect.objectContaining({ folderId: "root", snapshotFileId: null }));
    expect(mocks.saveGoogleDriveSnapshotFile).toHaveBeenCalledWith(7, "drive-file");
    expect(mocks.startSyncRun).toHaveBeenCalledWith("drive");
    expect(mocks.finishSyncRun).toHaveBeenCalledWith(expect.any(Number), "success", 1, expect.stringContaining("Google Drive 상품 스냅샷 1개 created"));
  });

  it("includes exact SKU mismatch details and the next retry time in the price job execution log", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T00:00:00.000Z"));
    mocks.activateManualTracksForKnownProducts.mockResolvedValue(0);
    mocks.getNextWaitingManualLink.mockResolvedValue({ id: 61, externalProductId: "78901:1:2" });
    mocks.searchCatalogSafely.mockResolvedValue({ source: "coupang", products: [] });

    await refreshTrackedPrices();

    expect(mocks.finishSyncRun).toHaveBeenCalledWith(
      17,
      "success",
      0,
      expect.stringContaining("수동 링크 61: productId·itemId·vendorItemId 정확 SKU 미일치. 다음 재조회 후보 2026-08-14T12:00:00.000Z")
    );
    vi.useRealTimers();
  });

  it("marks search-origin products as deferred instead of re-searching them during the daily job", async () => {
    mocks.listAllTrackedProducts.mockResolvedValue([{ id: 203, source: "search", trackingPriority: "high", lastSeenAt: new Date(), lastViewedAt: new Date(), externalProductId: "search-sku" }]);
    mocks.deferSearchProductRefresh.mockResolvedValue(1);

    await refreshTrackedPrices();

    expect(mocks.deferSearchProductRefresh).toHaveBeenCalledWith([203]);
    expect(mocks.finishSyncRun).toHaveBeenCalledWith(17, "success", 0, expect.stringContaining("검색 등록 1개는 안전한 Search API 예산을 위해 일괄 재조회하지 않았습니다."));
  });

  it("rechecks one deferred search product after protection is lifted and records fresh recovery", async () => {
    const deferred = { id: 204, source: "search", trackingPriority: "high", lastSeenAt: new Date(), lastViewedAt: new Date(), externalProductId: "recheck-sku", name: "안전 재확인 상품" };
    mocks.listAllTrackedProducts.mockResolvedValue([deferred]);
    mocks.deferSearchProductRefresh.mockResolvedValue(1);
    mocks.getDeferredSearchProducts.mockResolvedValue([deferred]);
    mocks.searchCatalogSafely.mockResolvedValue({ source: "coupang", products: [{ externalProductId: "recheck-sku" }] });

    await refreshTrackedPrices();

    expect(mocks.searchCatalogSafely).toHaveBeenCalledWith("안전 재확인 상품", 10, { forceExternal: true, callType: "price-tracking" });
    expect(mocks.recordDeferredSearchRecheckMiss).not.toHaveBeenCalled();
    expect(mocks.finishSyncRun).toHaveBeenCalledWith(17, "success", 0, expect.stringContaining("deferred 검색 상품 1개 재확인: fresh 1개 · 수집기 관측 유지 0개 · 정확 SKU 미일치 0개"));
  });
});
