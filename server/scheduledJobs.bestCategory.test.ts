import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSearchApiQuotaStatus: vi.fn(),
  startSyncRun: vi.fn(),
  finishSyncRun: vi.fn(),
  upsertCoupangProducts: vi.fn(),
  replaceCategoryBestProducts: vi.fn(),
  markScheduleCompleted: vi.fn(),
  getBestCategoryProducts: vi.fn(),
}));

vi.mock("./db", () => ({
  getSearchApiQuotaStatus: mocks.getSearchApiQuotaStatus,
  startSyncRun: mocks.startSyncRun,
  finishSyncRun: mocks.finishSyncRun,
  upsertCoupangProducts: mocks.upsertCoupangProducts,
  replaceCategoryBestProducts: mocks.replaceCategoryBestProducts,
  markScheduleCompleted: mocks.markScheduleCompleted,
}));
vi.mock("./coupang", () => ({
  COUPANG_BEST_CATEGORY_IDS: [1001, 1016, 1017],
  getBestCategoryProducts: mocks.getBestCategoryProducts,
  getGoldBoxProducts: vi.fn(),
  getCoupangVariantKey: vi.fn(),
}));
vi.mock("./catalogSearch", () => ({ searchCatalogSafely: vi.fn() }));
vi.mock("./deepLinks", () => ({ generatePendingDeepLinks: vi.fn() }));
vi.mock("./googleDrivePersonal", () => ({ syncProductsToPersonalGoogleDrive: vi.fn() }));
vi.mock("./coupangRateLimit", () => ({ CoupangRateLimitError: class CoupangRateLimitError extends Error {} }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));

import { collectBestCategoryProducts } from "./scheduledJobs";

describe("official category-best collection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSearchApiQuotaStatus.mockResolvedValue({ allowed: true });
    mocks.startSyncRun.mockResolvedValue(44);
    mocks.getBestCategoryProducts.mockImplementation(async categoryId => [{ productId: categoryId, productName: `상품 ${categoryId}`, productPrice: 1000, productImage: "https://image.example/item.jpg", productUrl: `https://link.coupang.com/a/${categoryId}` }]);
    mocks.upsertCoupangProducts.mockImplementation(async offers => offers.map((offer: { productId: number }) => ({ id: offer.productId })));
  });

  it("uses the official category list, stores each category position, and does not manufacture purchase counts", async () => {
    await expect(collectBestCategoryProducts()).resolves.toMatchObject({ processedCount: 3 });
    expect(mocks.getBestCategoryProducts).toHaveBeenCalledTimes(3);
    expect(mocks.getBestCategoryProducts).toHaveBeenNthCalledWith(1, 1001, 4);
    expect(mocks.replaceCategoryBestProducts).toHaveBeenCalledWith(1016, [1016]);
    expect(mocks.markScheduleCompleted).toHaveBeenCalledWith("bestcategory");
  });
});
