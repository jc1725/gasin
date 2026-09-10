import { beforeEach, describe, expect, it, vi } from "vitest";

// 검색만 해도 상품이 통째로 영구 저장되어 가격 추적 목록이 무작위로 계속 늘어나는
// 것을 막기 위한 지연 등록(lazy tracking) 동작을 검증한다. persistNewResults:false로
// 호출하면 새로 발견된 결과는 DB에 저장하지 않고, materializeSearchResult로 실제
// 클릭(상세 열람·찜)할 때만 저장되어야 한다.
//
// rawSearchResultCache는 모듈 전역 상태라 테스트 간에 공유된다. 서로 다른 테스트가
// 같은 검색어를 쓰면 앞선 테스트의 캐시가 뒤 테스트의 "쿠팡 API 호출 횟수" 기대값을
// 오염시키므로, 테스트마다 겹치지 않는 검색어를 사용한다.
const mocks = vi.hoisted(() => ({
  findCachedSearchProducts: vi.fn(),
  searchTrackedProducts: vi.fn(),
  recordMissingSearch: vi.fn(),
  searchCoupangProducts: vi.fn(),
  upsertCoupangProducts: vi.fn(),
  upsertCoupangProduct: vi.fn(),
  invalidateCachedSearchProducts: vi.fn(),
}));

vi.mock("./db", () => ({
  findCachedSearchProducts: mocks.findCachedSearchProducts,
  searchTrackedProducts: mocks.searchTrackedProducts,
  recordMissingSearch: mocks.recordMissingSearch,
  upsertCoupangProducts: mocks.upsertCoupangProducts,
  upsertCoupangProduct: mocks.upsertCoupangProduct,
  invalidateCachedSearchProducts: mocks.invalidateCachedSearchProducts,
}));
vi.mock("./coupang", async () => {
  const actual = await vi.importActual<typeof import("./coupang")>("./coupang");
  return { ...actual, searchCoupangProducts: mocks.searchCoupangProducts };
});

import { materializeSearchResult, searchCatalogSafely } from "./catalogSearch";

function rawProduct(productId: number) {
  return {
    productId,
    productName: "퀸센스 인덕션 로제 냄비 2개",
    productPrice: 45000,
    productImage: "https://example.com/pot.jpg",
    productUrl: `https://link.coupang.com/re/AFFSDP?lptag=x&itemId=${productId}11&vendorItemId=${productId}22`,
    categoryName: "생활용품",
    isRocket: false,
    isFreeShipping: true,
  };
}

describe("lazy-tracking search (persistNewResults: false)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCachedSearchProducts.mockResolvedValue(undefined);
    mocks.searchTrackedProducts.mockResolvedValue([]);
  });

  it("returns unsaved (id: null) results and never writes to the products table", async () => {
    const product = rawProduct(101);
    mocks.searchCoupangProducts.mockResolvedValue([product]);

    const result = await searchCatalogSafely("로제 냄비", 10, { persistNewResults: false });

    expect(mocks.upsertCoupangProducts).not.toHaveBeenCalled();
    expect(result.source).toBe("coupang");
    expect(result.products).toHaveLength(1);
    const [returned] = result.products;
    expect(returned).toMatchObject({
      id: null,
      name: product.productName,
      currentPrice: 45000,
      source: "search",
      pendingMaterialize: { keyword: "로제 냄비", productId: 101, productUrl: product.productUrl },
    });
  });

  it("reuses the cached raw response on a repeat lazy search instead of calling the Coupang API again", async () => {
    mocks.searchCoupangProducts.mockResolvedValue([rawProduct(102)]);

    await searchCatalogSafely("인덕션 냄비", 10, { persistNewResults: false });
    await searchCatalogSafely("인덕션 냄비", 10, { persistNewResults: false });

    expect(mocks.searchCoupangProducts).toHaveBeenCalledTimes(1);
  });

  it("materializes (upserts) only the exact clicked product, using the server-cached data rather than trusting client input", async () => {
    const product = rawProduct(103);
    mocks.searchCoupangProducts.mockResolvedValue([product]);
    await searchCatalogSafely("퀸센스 냄비", 10, { persistNewResults: false });
    const savedRow = { id: 9001, externalProductId: "103:10311:10322", name: product.productName, source: "search" };
    mocks.upsertCoupangProduct.mockResolvedValue(savedRow);

    const materialized = await materializeSearchResult("퀸센스 냄비", { productId: 103, productUrl: product.productUrl });

    expect(mocks.upsertCoupangProduct).toHaveBeenCalledWith(expect.objectContaining({ productId: 103, productName: product.productName }), "search");
    expect(materialized).toEqual(savedRow);
  });

  it("returns null (does not fabricate a product) when nothing was cached for that keyword", async () => {
    const materialized = await materializeSearchResult("한번도-검색-안한-검색어", { productId: 999, productUrl: "https://link.coupang.com/re/x?itemId=1&vendorItemId=2" });
    expect(materialized).toBeNull();
    expect(mocks.upsertCoupangProduct).not.toHaveBeenCalled();
  });

  it("still reuses already-tracked rows from the database as real products instead of ephemeral ones", async () => {
    mocks.searchTrackedProducts.mockResolvedValue([
      { id: 42, name: "이미 추적 중인 상품 A", externalProductId: "42:1:2", currentPrice: 1000, inStock: true },
      { id: 43, name: "이미 추적 중인 상품 B", externalProductId: "43:1:2", currentPrice: 1000, inStock: true },
      { id: 44, name: "이미 추적 중인 상품 C", externalProductId: "44:1:2", currentPrice: 1000, inStock: true },
    ]);

    const result = await searchCatalogSafely("이미 추적 중인 상품 검색어", 10, { persistNewResults: false });

    expect(result.source).toBe("database");
    expect(mocks.searchCoupangProducts).not.toHaveBeenCalled();
  });
});
