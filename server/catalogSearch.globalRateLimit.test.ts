import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoupangRateLimitError } from "./coupangRateLimit";

const mocks = vi.hoisted(() => ({
  findCachedSearchProducts: vi.fn(),
  searchTrackedProducts: vi.fn(),
  getCoupangApiRateLimitStatus: vi.fn(),
  recordCoupangRateLimitEvent: vi.fn(),
  recordMissingSearch: vi.fn(),
  reserveSearchApiCall: vi.fn(),
  searchCoupangProducts: vi.fn(),
  upsertCoupangProducts: vi.fn(),
  saveDeepLinkForProduct: vi.fn(),
  cacheSearchProducts: vi.fn(),
  invalidateCachedSearchProducts: vi.fn(),
}));

vi.mock("./db", () => ({
  findCachedSearchProducts: mocks.findCachedSearchProducts,
  searchTrackedProducts: mocks.searchTrackedProducts,
  getCoupangApiRateLimitStatus: mocks.getCoupangApiRateLimitStatus,
  recordCoupangRateLimitEvent: mocks.recordCoupangRateLimitEvent,
  recordMissingSearch: mocks.recordMissingSearch,
  upsertCoupangProducts: mocks.upsertCoupangProducts,
  saveDeepLinkForProduct: mocks.saveDeepLinkForProduct,
  cacheSearchProducts: mocks.cacheSearchProducts,
  invalidateCachedSearchProducts: mocks.invalidateCachedSearchProducts,
  reserveSearchApiCall: mocks.reserveSearchApiCall,
}));
vi.mock("./coupang", () => ({ searchCoupangProducts: mocks.searchCoupangProducts }));

import { searchCatalogSafely } from "./catalogSearch";

describe("searchCatalogSafely global rate protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCachedSearchProducts.mockResolvedValue(undefined);
    mocks.searchTrackedProducts.mockResolvedValue([]);
  });

  it("records an external search with no products", async () => {
    mocks.getCoupangApiRateLimitStatus.mockResolvedValue({ allowed: true });
    mocks.reserveSearchApiCall.mockResolvedValue({ allowed: true });
    mocks.searchCoupangProducts.mockResolvedValue([]);
    mocks.upsertCoupangProducts.mockResolvedValue([]);
    mocks.cacheSearchProducts.mockResolvedValue(undefined);

    await expect(searchCatalogSafely("없는 제품명")).resolves.toMatchObject({ source: "coupang", products: [] });
    expect(mocks.recordMissingSearch).toHaveBeenCalledWith("없는 제품명");
  });

  it("shows the exact option SKU only once when saved tracking data includes an equivalent page-only legacy row", async () => {
    mocks.searchTrackedProducts.mockResolvedValue([
      { id: 2430122, name: "매일우유 무지방 0%, 200ml, 120개", externalProductId: "33414098", variantLabel: "200ml × 120개", currentPrice: 62510 },
      { id: 3030001, name: "매일우유 무지방 0%, 200ml, 120개", externalProductId: "33414098:8483121623:94983884904", variantLabel: "200ml × 120개", currentPrice: 62510 },
    ]);

    await expect(searchCatalogSafely("매일우유 무지방")).resolves.toMatchObject({ source: "database", products: [{ id: 3030001 }] });
    expect(mocks.searchCoupangProducts).not.toHaveBeenCalled();
  });

  it("does not let an empty saved cache block one allowed official search", async () => {
    mocks.findCachedSearchProducts.mockResolvedValue([]);
    mocks.searchCoupangProducts.mockResolvedValue([{ productId: 5, productName: "케라스타즈 샴푸" }]);
    mocks.upsertCoupangProducts.mockResolvedValue([{ id: 95, name: "케라스타즈 샴푸", affiliateUrl: "https://link.coupang.com/a/kerastase-live" }]);

    await expect(searchCatalogSafely("케라스타즈")).resolves.toMatchObject({ source: "coupang", products: [{ id: 95 }] });
    expect(mocks.invalidateCachedSearchProducts).toHaveBeenCalledWith("케라스타즈");
    expect(mocks.searchCoupangProducts).toHaveBeenCalledWith("케라스타즈", 10, "product-search");
  });

  it("uses one official search immediately when the stored match has no current price", async () => {
    mocks.searchTrackedProducts.mockResolvedValue([
      { id: 501, name: "새 제품", currentPrice: 0, inStock: true },
    ]);
    mocks.searchCoupangProducts.mockResolvedValue([{ productId: 501, productName: "새 제품" }]);
    mocks.upsertCoupangProducts.mockResolvedValue([{ id: 501, name: "새 제품", currentPrice: 12_000, inStock: true, affiliateUrl: "" }]);
    mocks.cacheSearchProducts.mockResolvedValue(undefined);

    await expect(searchCatalogSafely("새 제품")).resolves.toMatchObject({ source: "coupang", products: [{ id: 501 }] });
    expect(mocks.searchCoupangProducts).toHaveBeenCalledWith("새 제품", 10, "product-search");
  });

  it("reuses a partner URL returned by Search API without calling the DeepLink API", async () => {
    mocks.getCoupangApiRateLimitStatus.mockResolvedValue({ allowed: true });
    mocks.reserveSearchApiCall.mockResolvedValue({ allowed: true });
    mocks.searchCoupangProducts.mockResolvedValue([{ productId: 1, productName: "테스트 상품" }]);
    mocks.upsertCoupangProducts.mockResolvedValue([{ id: 81, name: "테스트 상품", affiliateUrl: "https://link.coupang.com/re/AFFSDP?lptag=test&pageKey=1" }]);
    mocks.cacheSearchProducts.mockResolvedValue(undefined);

    await expect(searchCatalogSafely("테스트 상품")).resolves.toMatchObject({ source: "coupang" });
    expect(mocks.saveDeepLinkForProduct).toHaveBeenCalledWith(81, "https://link.coupang.com/re/AFFSDP?lptag=test&pageKey=1");
  });

  it("discards an unrelated cached result and uses one budgeted official search instead", async () => {
    mocks.findCachedSearchProducts.mockResolvedValue([{ id: 1920001, name: "테토쿨 댄드랩 두피 앰플" }]);
    mocks.getCoupangApiRateLimitStatus.mockResolvedValue({ allowed: true });
    mocks.reserveSearchApiCall.mockResolvedValue({ allowed: true });
    mocks.searchCoupangProducts.mockResolvedValue([{ productId: 2, productName: "케라스타즈 엘릭서 얼팀 샴푸" }]);
    mocks.upsertCoupangProducts.mockResolvedValue([{ id: 92, name: "케라스타즈 엘릭서 얼팀 샴푸", affiliateUrl: "https://link.coupang.com/a/kerastase" }]);

    await expect(searchCatalogSafely("케라스타즈")).resolves.toMatchObject({ source: "coupang", products: [{ id: 92 }] });
    expect(mocks.invalidateCachedSearchProducts).toHaveBeenCalledWith("케라스타즈");
    expect(mocks.searchCoupangProducts).toHaveBeenCalledWith("케라스타즈", 10, "product-search");
  });

  it("bypasses a same-keyword cache for an explicit refresh but makes only one budgeted official request", async () => {
    mocks.findCachedSearchProducts.mockResolvedValue([{ id: 7, name: "케라스타즈 엘릭서 얼팀 샴푸" }]);
    mocks.getCoupangApiRateLimitStatus.mockResolvedValue({ allowed: true });
    mocks.reserveSearchApiCall.mockResolvedValue({ allowed: true });
    mocks.searchCoupangProducts.mockResolvedValue([{ productId: 3, productName: "케라스타즈 엘릭서 얼팀 샴푸" }]);
    mocks.upsertCoupangProducts.mockResolvedValue([{ id: 93, name: "케라스타즈 엘릭서 얼팀 샴푸", affiliateUrl: "https://link.coupang.com/a/kerastase-refresh" }]);

    await expect(searchCatalogSafely("케라스타즈 샴푸", 10, { forceExternal: true })).resolves.toMatchObject({ source: "coupang", products: [{ id: 93 }] });
    expect(mocks.findCachedSearchProducts).not.toHaveBeenCalled();
    expect(mocks.searchCoupangProducts).toHaveBeenCalledTimes(1);
  });

  it("retries once with a spelling variant when the first user search has no relevant result", async () => {
    mocks.searchCoupangProducts
      .mockResolvedValueOnce([{ productId: 1, productName: "라네즈 수분 크림", productPrice: 12000, productImage: "https://image.test/laneige.jpg", productUrl: "https://www.coupang.com/vp/products/1" }])
      .mockResolvedValueOnce([{ productId: 2, productName: "비플레인 녹두 약산성 폼클렌저 80ml", productPrice: 9900, productImage: "https://image.test/beplain.jpg", productUrl: "https://www.coupang.com/vp/products/2" }]);
    mocks.upsertCoupangProducts.mockResolvedValue([{ id: 201, name: "비플레인 녹두 약산성 폼클렌저 80ml", currentPrice: 9900, affiliateUrl: "" }]);
    mocks.cacheSearchProducts.mockResolvedValue(undefined);

    await expect(searchCatalogSafely("비플레인 클렌징폼 80ml")).resolves.toMatchObject({
      source: "coupang",
      products: [{ id: 201 }],
    });
    expect(mocks.searchCoupangProducts).toHaveBeenNthCalledWith(1, "비플레인 클렌징폼 80ml", 10, "product-search");
    expect(mocks.searchCoupangProducts).toHaveBeenNthCalledWith(2, "비플레인 폼클렌저 80ml", 10, "product-search");
  });

  it("does not store or cache unrelated default products returned by the official API", async () => {
    mocks.searchCoupangProducts.mockResolvedValue([
      { productId: 1, productName: "코카콜라 오리지널 300ml" },
      { productId: 2, productName: "너구리 얼큰한맛" },
    ]);

    await expect(searchCatalogSafely("케라스타즈 샴푸")).resolves.toMatchObject({
      source: "coupang",
      products: [],
      message: expect.stringContaining("무관한 결과"),
    });
    expect(mocks.upsertCoupangProducts).not.toHaveBeenCalled();
    expect(mocks.cacheSearchProducts).not.toHaveBeenCalled();
    expect(mocks.invalidateCachedSearchProducts).toHaveBeenCalledWith("케라스타즈 샴푸");
    expect(mocks.recordMissingSearch).toHaveBeenCalledWith("케라스타즈 샴푸");
  });

  it("does not bypass global protection when an explicit refresh is requested", async () => {
    const retryAt = new Date("2026-08-15T17:07:00.000Z");
    mocks.searchCoupangProducts.mockRejectedValue(new CoupangRateLimitError(retryAt, "minute-limit"));

    await expect(searchCatalogSafely("케라스타즈 샴푸", 10, { forceExternal: true })).resolves.toMatchObject({ source: "rate_limited", limitReason: "minute-limit", retryAt });
    expect(mocks.searchCoupangProducts).toHaveBeenCalledWith("케라스타즈 샴푸", 10, "product-search");
  });

  it("returns a rate-limited result without reserving or calling the Search API while globally blocked", async () => {
    const retryAt = new Date("2026-08-15T17:07:00.000Z");
    mocks.searchCoupangProducts.mockRejectedValue(new CoupangRateLimitError(retryAt, "minute-limit"));

    await expect(searchCatalogSafely("녹두 클렌징폼")).resolves.toMatchObject({
      source: "rate_limited",
      limitReason: "minute-limit",
      retryAt,
      message: `쿠팡 전체 API 보호 모드(minute-limit)로 외부 검색을 ${retryAt.toISOString()}까지 멈췄습니다.`,
    });
    expect(mocks.searchCoupangProducts).toHaveBeenCalledWith("녹두 클렌징폼", 10, "product-search");
    expect(mocks.recordCoupangRateLimitEvent).toHaveBeenCalledWith("search", "minute-limit", retryAt);
    expect(mocks.recordMissingSearch).not.toHaveBeenCalled();
  });

  it("turns an upstream global minute-limit error into a transparent rate-limited search result", async () => {
    const retryAt = new Date("2026-08-15T17:07:00.000Z");
    mocks.searchCoupangProducts.mockRejectedValue(new CoupangRateLimitError(retryAt, "minute-limit"));

    await expect(searchCatalogSafely("녹두 클렌징폼")).resolves.toMatchObject({
      source: "rate_limited",
      limitReason: "minute-limit",
      retryAt,
      message: `쿠팡 전체 API 보호 모드(minute-limit)로 외부 검색을 ${retryAt.toISOString()}까지 멈췄습니다.`,
    });
    expect(mocks.recordCoupangRateLimitEvent).toHaveBeenCalledWith("search", "minute-limit", retryAt);
  });
});
