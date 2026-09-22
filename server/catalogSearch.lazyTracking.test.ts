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

  // 2026-09-22: DB 결과 3개는 limit(10)보다 적으므로, 이제 쿠팡 API도 함께 호출해
  // 보완한다(교체 아님). 여기서는 API가 새로 찾은 게 없는 경우를 검증한다 — 그래도
  // 이미 추적 중인 DB 행은 (ephemeral이 아니라) 그대로 실제 상품으로 남는다.
  it("still reuses already-tracked rows from the database as real products instead of ephemeral ones (even though the Coupang API is now also queried below the 10-result threshold)", async () => {
    mocks.searchTrackedProducts.mockResolvedValue([
      { id: 42, name: "이미 추적 중인 상품 A", externalProductId: "42:1:2", currentPrice: 1000, inStock: true },
      { id: 43, name: "이미 추적 중인 상품 B", externalProductId: "43:1:2", currentPrice: 1000, inStock: true },
      { id: 44, name: "이미 추적 중인 상품 C", externalProductId: "44:1:2", currentPrice: 1000, inStock: true },
    ]);
    mocks.searchCoupangProducts.mockResolvedValue([]);

    const result = await searchCatalogSafely("이미 추적 중인 상품 검색어", 10, { persistNewResults: false });

    expect(mocks.searchCoupangProducts).toHaveBeenCalled();
    expect(result.source).toBe("database");
    expect(result.products.map(product => product.id)).toEqual([42, 43, 44]);
  });

  // "볼륨업 브이패드 검색시 결과 없음" 수정의 지연 등록(lazy) 경로 버전: DB 결과가
  // 부족할 때 쿠팡 API가 실제로 새 결과를 주면, 기존 DB 결과를 대체하지 않고 뒤에
  // 이어붙인 "DB + 쿠팡" 합본을 ephemeral 결과와 함께 반환한다.
  it("merges database matches with fresh Coupang results instead of replacing them when stored coverage is below the limit", async () => {
    mocks.searchTrackedProducts.mockResolvedValue([
      { id: 42, name: "이미 추적 중인 상품 A", externalProductId: "42:1:2", currentPrice: 1000, inStock: true, familyKey: "family-a", unitLabel: "1개", quantity: 1 },
    ]);
    mocks.searchCoupangProducts.mockResolvedValue([rawProduct(201)]);

    const result = await searchCatalogSafely("합본 검색어", 10, { persistNewResults: false });

    expect(result.source).toBe("coupang");
    const ids = result.products.map(product => (product as { id: number | null }).id);
    expect(ids).toContain(42); // 기존 DB 결과가 사라지지 않고 남아있는다.
    expect(result.products.some(product => product.id === null)).toBe(true); // 새 쿠팡 결과(ephemeral)도 포함된다.
  });
});
