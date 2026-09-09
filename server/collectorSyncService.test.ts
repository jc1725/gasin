import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ startSyncRun: vi.fn(), syncLatestCollectedPricesToTrackedProducts: vi.fn(), finishSyncRun: vi.fn(), checkAndSendExtensionPriceAlerts: vi.fn() }));
vi.mock("./db", () => ({ startSyncRun: mocks.startSyncRun, syncLatestCollectedPricesToTrackedProducts: mocks.syncLatestCollectedPricesToTrackedProducts, finishSyncRun: mocks.finishSyncRun }));
vi.mock("./priceAlertService", () => ({ checkAndSendExtensionPriceAlerts: mocks.checkAndSendExtensionPriceAlerts }));
import { syncCollectedPriceDataForAdmin } from "./collectorSyncService";

describe("collector data sync", () => {
  it("applies only changed latest collector prices and checks those products for target alerts", async () => {
    const updatedProducts = [{ id: 17, name: "수집 상품", currentPrice: 9_900 }];
    mocks.startSyncRun.mockResolvedValue(31);
    mocks.syncLatestCollectedPricesToTrackedProducts.mockResolvedValue({ observedCount: 3, matchedCount: 2, updatedCount: 1, unchangedCount: 1, staleCount: 0, unmatchedCount: 1, invalidCount: 0, updatedProducts });
    mocks.checkAndSendExtensionPriceAlerts.mockResolvedValue({ sent: 0 });
    const result = await syncCollectedPriceDataForAdmin();
    expect(mocks.checkAndSendExtensionPriceAlerts).toHaveBeenCalledWith([17]);
    expect(mocks.finishSyncRun).toHaveBeenCalledWith(31, "success", 1, expect.stringContaining("반영 1개"));
    expect(result.updatedCount).toBe(1);
  });
});
