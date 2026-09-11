import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findCachedSearchProducts: vi.fn(),
  invalidateCachedSearchProducts: vi.fn(),
  searchTrackedProducts: vi.fn(),
  upsertCoupangProducts: vi.fn(),
  saveDeepLinkForProduct: vi.fn(),
  cacheSearchProducts: vi.fn(),
  recordMissingSearch: vi.fn(),
  recordCoupangRateLimitEvent: vi.fn(),
  blockSearchApiUntil: vi.fn(),
  searchCoupangProducts: vi.fn(),
  getCoupangVariantKey: vi.fn(),
  isExcludedTrackingCategory: vi.fn(),
}));

vi.mock("./db", () => ({
  findCachedSearchProducts: mocks.findCachedSearchProducts,
  invalidateCachedSearchProducts: mocks.invalidateCachedSearchProducts,
  searchTrackedProducts: mocks.searchTrackedProducts,
  upsertCoupangProducts: mocks.upsertCoupangProducts,
  saveDeepLinkForProduct: mocks.saveDeepLinkForProduct,
  cacheSearchProducts: mocks.cacheSearchProducts,
  recordMissingSearch: mocks.recordMissingSearch,
  recordCoupangRateLimitEvent: mocks.recordCoupangRateLimitEvent,
  blockSearchApiUntil: mocks.blockSearchApiUntil,
}));
vi.mock("./coupang", () => ({
  searchCoupangProducts: mocks.searchCoupangProducts,
  getCoupangVariantKey: mocks.getCoupangVariantKey,
}));
vi.mock("./categoryEligibility", () => ({ isExcludedTrackingCategory: mocks.isExcludedTrackingCategory }));
vi.mock("./searchQuotaAlert", () => ({ notifySearchQuotaExceeded: vi.fn() }));

import { searchCatalogSafely } from "./catalogSearch";

const pantheneKeyword = "팬틴 극손상케어 트리트먼트 220ml 1개";
const pantheneStoredProduct = {
  id: 501,
  name: "팬틴 극손상케어 트리트먼트",
  currentPrice: 5_350,
  inStock: true,
  categoryName: null,
  externalProductId: "8002554630:22293839581:89339376787",
  variantLabel: "220ml",
  isRocket: false,
  isFreeShipping: false,
};

describe("searchCatalogSafely - 저장 결과 커버리지 판단", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCachedSearchProducts.mockResolvedValue(undefined);
    mocks.isExcludedTrackingCategory.mockReturnValue(false);
  });

  // 가신 수집기로 등록된 상품처럼 DB에 정확히 일치하는 결과가 1개뿐이면 예전에는
  // "저장 결과가 부족하다"고 보고 매번 외부 쿠팡 API를 호출했다. 그 결과가 검색어와
  // 느슨하게만 겹치는 다른 상품으로 완전히 대체되면서, 이미 가격까지 확인된 정확한
  // 상품이 검색에서 사라지는 회귀가 있었다. hasFullKeywordMatch로 이 회귀를 막는다.
  it("DB 저장 결과가 1개뿐이어도 검색어 전체와 정확히 일치하면 외부 API를 호출하지 않는다", async () => {
    mocks.searchTrackedProducts.mockResolvedValue([pantheneStoredProduct]);

    const result = await searchCatalogSafely(pantheneKeyword);

    expect(result.source).toBe("database");
    expect(result.products).toEqual([pantheneStoredProduct]);
    expect(mocks.searchCoupangProducts).not.toHaveBeenCalled();
  });

  it("DB 저장 결과가 1개뿐이고 검색어와 완전히 일치하지도 않으면 외부 API로 보완한다", async () => {
    const looselyRelatedProduct = {
      id: 502,
      name: "팬틴 샴푸",
      currentPrice: 8_900,
      inStock: true,
      categoryName: null,
      externalProductId: "1111:2222:3333",
      variantLabel: "500ml",
      isRocket: true,
      isFreeShipping: false,
    };
    mocks.searchTrackedProducts.mockResolvedValue([looselyRelatedProduct]);
    mocks.searchCoupangProducts.mockResolvedValue([
      {
        productId: 9999,
        productName: "팬틴 극손상케어 트리트먼트 220ml",
        productPrice: 5_350,
        productImage: "https://example.com/image.jpg",
        productUrl: "https://link.coupang.com/a/example",
        categoryName: "헤어케어",
        isRocket: true,
        isFreeShipping: true,
      },
    ]);
    mocks.upsertCoupangProducts.mockResolvedValue([
      { id: 503, name: "팬틴 극손상케어 트리트먼트 220ml", currentPrice: 5_350, affiliateUrl: "https://link.coupang.com/a/example" },
    ]);
    mocks.saveDeepLinkForProduct.mockResolvedValue(undefined);
    mocks.cacheSearchProducts.mockResolvedValue(undefined);

    const result = await searchCatalogSafely(pantheneKeyword);

    expect(mocks.searchCoupangProducts).toHaveBeenCalled();
    expect(result.source).toBe("coupang");
  });

  it("DB 저장 결과가 3개 이상이면 기존과 같이 외부 API 없이 저장 결과를 사용한다", async () => {
    const stored = [1, 2, 3].map(index => ({
      id: index,
      name: `팬틴 극손상케어 트리트먼트 ${index}호`,
      currentPrice: 5_000 + index,
      inStock: true,
      categoryName: null,
      externalProductId: `100${index}:1:1`,
      variantLabel: null,
      isRocket: false,
      isFreeShipping: false,
    }));
    mocks.searchTrackedProducts.mockResolvedValue(stored);

    const result = await searchCatalogSafely("팬틴 극손상케어 트리트먼트");

    expect(result.source).toBe("database");
    expect(mocks.searchCoupangProducts).not.toHaveBeenCalled();
  });
});
