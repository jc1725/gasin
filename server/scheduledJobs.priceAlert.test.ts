import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startSyncRun: vi.fn(), finishSyncRun: vi.fn(), listAllTrackedProducts: vi.fn(), getTrackingPrioritySummary: vi.fn(), getSearchApiQuotaStatus: vi.fn(), deferSearchProductRefresh: vi.fn(), upsertCoupangProducts: vi.fn(), activateManualTracksForKnownProducts: vi.fn(), getNextWaitingManualLink: vi.fn(), setManualLinkWaitingError: vi.fn(), getDeferredSearchProducts: vi.fn(), recordDeferredSearchRecheckMiss: vi.fn(), markScheduleCompleted: vi.fn(), getGoogleDriveSnapshotConnection: vi.fn(), saveGoogleDriveSnapshotFile: vi.fn(), getGoldBoxProducts: vi.fn(), getCoupangVariantKey: vi.fn(), generatePendingDeepLinks: vi.fn(), searchCatalogSafely: vi.fn(), syncProductsToPersonalGoogleDrive: vi.fn(),
}));

vi.mock("./db", () => ({ startSyncRun: mocks.startSyncRun, finishSyncRun: mocks.finishSyncRun, listAllTrackedProducts: mocks.listAllTrackedProducts, getTrackingPrioritySummary: mocks.getTrackingPrioritySummary, getSearchApiQuotaStatus: mocks.getSearchApiQuotaStatus, deferSearchProductRefresh: mocks.deferSearchProductRefresh, upsertCoupangProducts: mocks.upsertCoupangProducts, activateManualTracksForKnownProducts: mocks.activateManualTracksForKnownProducts, getNextWaitingManualLink: mocks.getNextWaitingManualLink, setManualLinkWaitingError: mocks.setManualLinkWaitingError, getDeferredSearchProducts: mocks.getDeferredSearchProducts, recordDeferredSearchRecheckMiss: mocks.recordDeferredSearchRecheckMiss, markScheduleCompleted: mocks.markScheduleCompleted, getGoogleDriveSnapshotConnection: mocks.getGoogleDriveSnapshotConnection, saveGoogleDriveSnapshotFile: mocks.saveGoogleDriveSnapshotFile }));
vi.mock("./coupang", () => ({ COUPANG_BEST_CATEGORY_IDS: [], getBestCategoryProducts: vi.fn(), getGoldBoxProducts: mocks.getGoldBoxProducts, getCoupangVariantKey: mocks.getCoupangVariantKey }));
vi.mock("./deepLinks", () => ({ generatePendingDeepLinks: mocks.generatePendingDeepLinks }));
vi.mock("./catalogSearch", () => ({ searchCatalogSafely: mocks.searchCatalogSafely }));
vi.mock("./googleDrivePersonal", () => ({ syncProductsToPersonalGoogleDrive: mocks.syncProductsToPersonalGoogleDrive }));

import { refreshTrackedPrices } from "./scheduledJobs";

describe("daily tracked-price alert handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const refreshed = [{ id: 91, currentPrice: 9_900, name: "갱신 상품", lastSeenAt: new Date(), affiliateUrl: "https://link.coupang.com/a/test" }];
    mocks.startSyncRun.mockResolvedValue(1);
    mocks.getSearchApiQuotaStatus.mockResolvedValue({ allowed: true });
    mocks.listAllTrackedProducts.mockResolvedValue([{ source: "goldbox", trackingPriority: "high", lastSeenAt: new Date(0), lastViewedAt: null, externalProductId: "sku-91" }]);
    mocks.getTrackingPrioritySummary.mockResolvedValue({ high: 1, normal: 0, low: 0 });
    mocks.deferSearchProductRefresh.mockResolvedValue(0);
    mocks.getGoldBoxProducts.mockResolvedValue([{ externalProductId: "sku-91" }]);
    mocks.getCoupangVariantKey.mockImplementation((item: { externalProductId: string }) => item.externalProductId);
    mocks.upsertCoupangProducts.mockResolvedValue(refreshed);
    mocks.generatePendingDeepLinks.mockResolvedValue({ detail: "딥링크 대기 없음" });
    mocks.activateManualTracksForKnownProducts.mockResolvedValue(1);
    mocks.getGoogleDriveSnapshotConnection.mockResolvedValue(undefined);
    mocks.getDeferredSearchProducts.mockResolvedValue([]);
  });

  it("공식 API 가격 갱신은 와우 회원가 알림을 트리거하지 않는다", async () => {
    await refreshTrackedPrices();

    expect(mocks.finishSyncRun).toHaveBeenCalledWith(1, "success", 1, expect.stringContaining("공식 API 기본가는 표시용이며 알림에는 사용하지 않습니다."));
  });
});
