import { beforeEach, describe, expect, it, vi } from "vitest";

// 2026-10-06: 가격 재확인(1분 주기)이 검색 결과 최대 10개를 매번 새 추적 상품으로 저장해서
// 추적 상품이 10/1 37,237개 → 10/6 54,376개로 불어났다. updateExistingOnly는 이미 있는 SKU만
// 갱신하고 새 SKU는 저장하지 않아야 한다.
const mocks = vi.hoisted(() => ({
  findCachedSearchProducts: vi.fn(),
  searchTrackedProducts: vi.fn(),
  recordMissingSearch: vi.fn(),
  searchCoupangProducts: vi.fn(),
  upsertCoupangProducts: vi.fn(),
  upsertCoupangProduct: vi.fn(),
  invalidateCachedSearchProducts: vi.fn(),
  findExistingExternalProductIds: vi.fn(),
  cacheSearchProducts: vi.fn(),
  saveDeepLinkForProduct: vi.fn(),
}));

vi.mock("./db", () => ({
  findCachedSearchProducts: mocks.findCachedSearchProducts,
  searchTrackedProducts: mocks.searchTrackedProducts,
  recordMissingSearch: mocks.recordMissingSearch,
  upsertCoupangProducts: mocks.upsertCoupangProducts,
  upsertCoupangProduct: mocks.upsertCoupangProduct,
  invalidateCachedSearchProducts: mocks.invalidateCachedSearchProducts,
  findExistingExternalProductIds: mocks.findExistingExternalProductIds,
  cacheSearchProducts: mocks.cacheSearchProducts,
  saveDeepLinkForProduct: mocks.saveDeepLinkForProduct,
}));
vi.mock("./coupang", async () => {
  const actual = await vi.importActual<typeof import("./coupang")>("./coupang");
  return { ...actual, searchCoupangProducts: mocks.searchCoupangProducts };
});

import { getCoupangVariantKey } from "./coupang";
import { searchCatalogSafely } from "./catalogSearch";

function rawProduct(productId: number) {
  return {
    productId,
    productName: "스텐 프라이팬 28cm 1개",
    productPrice: 30000 + productId,
    productImage: "https://example.com/pan.jpg",
    productUrl: `https://link.coupang.com/re/AFFSDP?lptag=x&itemId=${productId}11&vendorItemId=${productId}22`,
    categoryName: "주방용품",
    isRocket: true,
    isFreeShipping: true,
  };
}

describe("searchCatalogSafely updateExistingOnly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCachedSearchProducts.mockResolvedValue(undefined);
    mocks.searchTrackedProducts.mockResolvedValue([]);
    mocks.upsertCoupangProducts.mockResolvedValue([]);
  });

  it("검색 결과 중 DB에 이미 있는 SKU만 저장(갱신)하고 새 SKU는 저장하지 않는다", async () => {
    const tracked = rawProduct(201);
    const newcomers = [rawProduct(202), rawProduct(203)];
    mocks.searchCoupangProducts.mockResolvedValue([tracked, ...newcomers]);
    mocks.findExistingExternalProductIds.mockResolvedValue(new Set([getCoupangVariantKey(tracked)]));

    await searchCatalogSafely("스텐 프라이팬 28cm", 10, { forceExternal: true, callType: "price-tracking", updateExistingOnly: true });

    expect(mocks.upsertCoupangProducts).toHaveBeenCalledTimes(1);
    const [saved, source] = mocks.upsertCoupangProducts.mock.calls[0]!;
    expect(source).toBe("search");
    expect((saved as Array<{ productId: number }>).map(item => item.productId)).toEqual([201]);
  });

  it("옵션이 없으면 예전처럼 검색 결과를 모두 저장한다(관리자 상품 요청 등 기존 경로 유지)", async () => {
    mocks.searchCoupangProducts.mockResolvedValue([rawProduct(211), rawProduct(212)]);

    await searchCatalogSafely("스텐 프라이팬 28cm", 10, { forceExternal: true, callType: "price-tracking" });

    expect(mocks.findExistingExternalProductIds).not.toHaveBeenCalled();
    const [saved] = mocks.upsertCoupangProducts.mock.calls[0]!;
    expect((saved as unknown[]).length).toBe(2);
  });
});
