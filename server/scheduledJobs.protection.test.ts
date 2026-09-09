import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoupangRateLimitError } from "./coupangRateLimit";

const mocks = vi.hoisted(() => ({
  startSyncRun: vi.fn(),
  finishSyncRun: vi.fn(),
  getSearchApiQuotaStatus: vi.fn(),
  deferSearchProductRefresh: vi.fn(),
  listAllTrackedProducts: vi.fn(),
  getTrackingPrioritySummary: vi.fn(),
  getGoldBoxProducts: vi.fn(),
}));

vi.mock("./db", () => ({
  startSyncRun: mocks.startSyncRun,
  finishSyncRun: mocks.finishSyncRun,
  getSearchApiQuotaStatus: mocks.getSearchApiQuotaStatus,
  deferSearchProductRefresh: mocks.deferSearchProductRefresh,
  listAllTrackedProducts: mocks.listAllTrackedProducts,
  getTrackingPrioritySummary: mocks.getTrackingPrioritySummary,
}));
vi.mock("./coupang", () => ({ COUPANG_BEST_CATEGORY_IDS: [], getBestCategoryProducts: vi.fn(), getGoldBoxProducts: mocks.getGoldBoxProducts, getCoupangVariantKey: vi.fn() }));
vi.mock("./catalogSearch", () => ({ searchCatalogSafely: vi.fn() }));
vi.mock("./deepLinks", () => ({ generatePendingDeepLinks: vi.fn() }));

import { collectGoldBoxProducts, refreshTrackedPrices } from "./scheduledJobs";

const retryAt = new Date("2026-08-15T17:06:50.000Z");

describe("scheduled job quota protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.startSyncRun.mockResolvedValue(99);
    mocks.getSearchApiQuotaStatus.mockResolvedValue({ allowed: false, reason: "emergency-block", retryAt });
    mocks.deferSearchProductRefresh.mockResolvedValue(0);
  });

  it("returns a successful skip and does not call the GoldBox API while protected", async () => {
    await expect(collectGoldBoxProducts()).resolves.toMatchObject({ processedCount: 0, skipped: true });
    expect(mocks.getGoldBoxProducts).not.toHaveBeenCalled();
    expect(mocks.finishSyncRun).toHaveBeenCalledWith(99, "success", 0, expect.stringContaining(retryAt.toISOString()));
  });

  it("skips tracked-price refresh with a 2xx-safe outcome and no external API call", async () => {
    mocks.listAllTrackedProducts.mockResolvedValue([{ source: "search" }]);
    mocks.getTrackingPrioritySummary.mockResolvedValue({ high: 1, normal: 2, low: 3 });
    mocks.deferSearchProductRefresh.mockResolvedValue(1);
    await expect(refreshTrackedPrices()).resolves.toMatchObject({ processedCount: 0, skipped: true });
    expect(mocks.getGoldBoxProducts).not.toHaveBeenCalled();
    expect(mocks.finishSyncRun).toHaveBeenCalledWith(99, "success", 0, expect.stringContaining("검색 등록 1개"));
  });

  it("converts a global minute-limit error into a successful skip instead of a retrying 500", async () => {
    const globalRetryAt = new Date("2026-08-15T17:07:00.000Z");
    mocks.getSearchApiQuotaStatus.mockResolvedValue({ allowed: true });
    mocks.getGoldBoxProducts.mockRejectedValue(new CoupangRateLimitError(globalRetryAt, "minute-limit"));

    await expect(collectGoldBoxProducts()).resolves.toMatchObject({ processedCount: 0, skipped: true });
    expect(mocks.finishSyncRun).toHaveBeenCalledWith(99, "success", 0, expect.stringContaining(globalRetryAt.toISOString()));
  });
});
