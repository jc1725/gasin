import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkAndSendPriceAlerts: vi.fn(), startSyncRun: vi.fn(), finishSyncRun: vi.fn(), listAllTrackedProducts: vi.fn(), getTrackingPrioritySummary: vi.fn(), getSearchApiQuotaStatus: vi.fn(), deferSearchProductRefresh: vi.fn(), upsertCoupangProducts: vi.fn(), activateManualTracksForKnownProducts: vi.fn(), getNextWaitingManualLink: vi.fn(), setManualLinkWaitingError: vi.fn(), getDeferredSearchProducts: vi.fn(), recordDeferredSearchRecheckMiss: vi.fn(), markScheduleCompleted: vi.fn(), getGoogleDriveSnapshotConnection: vi.fn(), saveGoogleDriveSnapshotFile: vi.fn(), getGoldBoxProducts: vi.fn(), getCoupangVariantKey: vi.fn(), generatePendingDeepLinks: vi.fn(), searchCatalogSafely: vi.fn(), syncProductsToPersonalGoogleDrive: vi.fn(),
}));

vi.mock("./db", () => ({ startSyncRun: mocks.startSyncRun, finishSyncRun: mocks.finishSyncRun, listAllTrackedProducts: mocks.listAllTrackedProducts, getTrackingPrioritySummary: mocks.getTrackingPrioritySummary, getSearchApiQuotaStatus: mocks.getSearchApiQuotaStatus, deferSearchProductRefresh: mocks.deferSearchProductRefresh, upsertCoupangProducts: mocks.upsertCoupangProducts, activateManualTracksForKnownProducts: mocks.activateManualTracksForKnownProducts, getNextWaitingManualLink: mocks.getNextWaitingManualLink, setManualLinkWaitingError: mocks.setManualLinkWaitingError, getDeferredSearchProducts: mocks.getDeferredSearchProducts, recordDeferredSearchRecheckMiss: mocks.recordDeferredSearchRecheckMiss, markScheduleCompleted: mocks.markScheduleCompleted, getGoogleDriveSnapshotConnection: mocks.getGoogleDriveSnapshotConnection, saveGoogleDriveSnapshotFile: mocks.saveGoogleDriveSnapshotFile }));
vi.mock("./coupang", () => ({ COUPANG_BEST_CATEGORY_IDS: [], getBestCategoryProducts: vi.fn(), getGoldBoxProducts: mocks.getGoldBoxProducts, getCoupangVariantKey: mocks.getCoupangVariantKey }));
vi.mock("./priceAlertService", () => ({ checkAndSendPriceAlerts: mocks.checkAndSendPriceAlerts }));
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
    mocks.checkAndSendPriceAlerts.mockResolvedValue({ sent: 2 });
  });

  it("공식 API 가격 갱신 뒤 갱신된 상품의 목표가·최저가 알림을 평가한다", async () => {
    await refreshTrackedPrices();

    expect(mocks.checkAndSendPriceAlerts).toHaveBeenCalledWith([91]);
    expect(mocks.finishSyncRun).toHaveBeenCalledWith(1, "success", 1, expect.stringContaining("가격 알림 1개 상품 평가 · 발송 2건"));
  });

  it("알림 평가가 실패해도 가격 갱신 작업은 성공으로 끝난다", async () => {
    mocks.checkAndSendPriceAlerts.mockRejectedValue(new Error("smtp down"));

    await refreshTrackedPrices();

    expect(mocks.finishSyncRun).toHaveBeenCalledWith(1, "success", 1, expect.stringContaining("가격 알림 평가 실패(가격 갱신은 완료)"));
  });
});
