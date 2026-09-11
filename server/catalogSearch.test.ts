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

  // 실제로 라이브 재현된 사고(1~3차 수정 배포 후에도 재현됨): DB에 완전 일치 상품이 있어도,
  // 같은 검색어로 함께 저장된 "로켓배송 묶음/세트" 상품이 여러 개 있으면
  // filterStableDeliveryResults가 배송 태그 없는 완전 일치 상품(가신 수집기로 등록한 낱개
  // 상품)을 통째로 걸러내고 로켓 태그만 있는 무관한 묶음 상품들만 남겼다. 이 4차 수정
  // 전에는 이 테스트가 실패했다.
  it("로켓배송 묶음 상품이 여러 개 섞여 있어도 배송 태그 없는 완전 일치 상품이 결과에서 빠지지 않는다", async () => {
    const rocketBundle = {
      id: 601,
      name: "팬틴 케라틴 극손상케어 트리트먼트 220ml 3p + 샴푸 90ml 세트",
      currentPrice: 13_910,
      inStock: true,
      categoryName: "뷰티",
      externalProductId: "9040457204:23269593474:90301941455",
      variantLabel: "90ml",
      isRocket: true,
      isFreeShipping: false,
    };
    mocks.searchTrackedProducts.mockResolvedValue([pantheneStoredProduct, rocketBundle]);

    const result = await searchCatalogSafely("팬틴 극손상케어 트리트먼트");

    expect(result.source).toBe("database");
    expect(result.products.map(product => product.id)).toContain(501);
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

  // 실제로 재현된 사고: 코드 수정을 배포해도, 그 전에 검색해 만들어진 12시간짜리
  // 캐시(searchCaches)가 남아 있으면 이후 동일 검색어 요청은 전부 findCachedSearchProducts에서
  // 그 낡은 결과를 그대로 반환해 버려 배포된 수정이 캐시 만료 전까지 전혀 반영되지 않았다.
  it("캐시에 완전 일치 상품이 없어도 DB에 있으면 캐시 대신 그 결과로 갱신해 반환한다", async () => {
    // 핵심 토큰 중 "팬틴"·"트리트먼트"는 있지만 "극손상케어"가 빠져 있어, rankSearchResults
    // 관련도 기준은 통과해 캐시 자체는 "쓸 만해" 보이면서도 hasFullKeywordMatch는 실패하는,
    // 즉 실제로 캐시가 낡았을 때와 같은 조건을 재현한다.
    const staleCachedProduct = {
      id: 999,
      name: "팬틴 트리트먼트 미니 90ml",
      currentPrice: 8_900,
      inStock: true,
      categoryName: null,
      externalProductId: "9999:1:1",
      variantLabel: "90ml",
      isRocket: false,
      isFreeShipping: false,
    };
    mocks.findCachedSearchProducts.mockResolvedValue([staleCachedProduct]);
    mocks.searchTrackedProducts.mockResolvedValue([pantheneStoredProduct]);
    mocks.cacheSearchProducts.mockResolvedValue(undefined);

    const result = await searchCatalogSafely(pantheneKeyword);

    expect(result.source).toBe("database");
    expect(result.products).toEqual([pantheneStoredProduct]);
    expect(mocks.invalidateCachedSearchProducts).toHaveBeenCalledWith(pantheneKeyword);
    expect(mocks.cacheSearchProducts).toHaveBeenCalledWith(pantheneKeyword, [501]);
    expect(mocks.searchCoupangProducts).not.toHaveBeenCalled();
  });

  it("캐시에 이미 완전 일치 상품이 있으면 DB를 다시 조회하지 않고 캐시를 그대로 사용한다", async () => {
    mocks.findCachedSearchProducts.mockResolvedValue([pantheneStoredProduct]);

    const result = await searchCatalogSafely(pantheneKeyword);

    expect(result.source).toBe("cache");
    expect(result.products).toEqual([pantheneStoredProduct]);
    expect(mocks.searchTrackedProducts).not.toHaveBeenCalled();
    expect(mocks.searchCoupangProducts).not.toHaveBeenCalled();
  });

  it("캐시에도 DB에도 완전 일치 상품이 없으면 기존처럼 캐시 결과를 그대로 사용한다", async () => {
    const staleCachedProduct = {
      id: 999,
      name: "팬틴 트리트먼트 미니 90ml",
      currentPrice: 8_900,
      inStock: true,
      categoryName: null,
      externalProductId: "9999:1:1",
      variantLabel: "90ml",
      isRocket: false,
      isFreeShipping: false,
    };
    mocks.findCachedSearchProducts.mockResolvedValue([staleCachedProduct]);
    mocks.searchTrackedProducts.mockResolvedValue([]);

    const result = await searchCatalogSafely(pantheneKeyword);

    expect(result.source).toBe("cache");
    expect(result.products).toEqual([staleCachedProduct]);
    expect(mocks.invalidateCachedSearchProducts).not.toHaveBeenCalled();
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

// 실제로 재현된 5차 사고: 같은 검색어를 다시 검색하면 프런트엔드(SearchProducts.tsx의
// runSearch)가 "재검색"으로 판단해 refresh: true → forceExternal: true를 보낸다.
// forceExternal은 위 hasFullKeywordMatch 기반 캐시·DB 보호 로직을 전부 건너뛰고
// 라이브 쿠팡 검색 API 결과만으로 응답하므로, 쿠팡 자체 랭킹이 가신에 등록된 낱개
// 상품보다 묶음/세트 상품을 우선하면 방금 전 첫 검색에서는 보이던 정확한 상품이
// "다시 검색"을 누르는 순간 사라졌다. findExactTrackedMatchForForcedRefresh로 이
// 회귀를 막는다.
describe("searchCatalogSafely - 재검색(forceExternal) 시 추적 중인 완전 일치 상품 보호", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCachedSearchProducts.mockResolvedValue(undefined);
    mocks.isExcludedTrackingCategory.mockReturnValue(false);
  });

  const bundleCoupangResult = {
    productId: 7001,
    productName: "팬틴 케라틴 극손상케어 트리트먼트 220ml 3p 세트",
    productPrice: 13_910,
    productImage: "https://example.com/bundle.jpg",
    productUrl: "https://link.coupang.com/a/bundle",
    categoryName: "뷰티",
    isRocket: true,
    isFreeShipping: false,
  };

  // 프런트엔드가 실제로 사용하는 모드(catalog.search는 항상 persistNewResults: false).
  // 쿠팡 라이브 검색이 세트 상품만 반환해도, 이미 추적 중인 완전 일치 상품(가신
  // 수집기로 등록된 낱개 상품)이 지연 등록 결과 맨 앞에 되살아나야 한다.
  it("지연 등록(persistNewResults: false) 재검색에서 쿠팡이 세트 상품만 반환해도 추적 중인 완전 일치 상품이 결과에 남는다", async () => {
    mocks.searchCoupangProducts.mockResolvedValue([bundleCoupangResult]);
    mocks.searchTrackedProducts.mockResolvedValue([pantheneStoredProduct]);

    const result = await searchCatalogSafely(pantheneKeyword, 10, { forceExternal: true, persistNewResults: false });

    expect(result.source).toBe("coupang");
    expect(result.products.some(product => product.externalProductId === pantheneStoredProduct.externalProductId)).toBe(true);
    expect(result.products[0]?.externalProductId).toBe(pantheneStoredProduct.externalProductId);
  });

  // 쿠팡이 검색어와 아예 무관한 결과만 주거나 아무것도 반환하지 않을 때도(relevantResults
  // 가 0개인 분기) 추적 중인 완전 일치 상품이 있다면 빈 결과 대신 그 상품을 보여준다.
  it("지연 등록 재검색에서 쿠팡 결과가 0개여도 추적 중인 완전 일치 상품을 대신 표시한다", async () => {
    mocks.searchCoupangProducts.mockResolvedValue([]);
    mocks.searchTrackedProducts.mockResolvedValue([pantheneStoredProduct]);

    const result = await searchCatalogSafely(pantheneKeyword, 10, { forceExternal: true, persistNewResults: false });

    expect(result.source).toBe("database");
    expect(result.products).toEqual([pantheneStoredProduct]);
    expect(mocks.invalidateCachedSearchProducts).toHaveBeenCalledWith(pantheneKeyword);
  });

  // 영구 저장(persistNewResults: true, 기본값) 경로에서도 동일하게 보호되어야 한다 —
  // 예: 관리자 화면 등에서 forceExternal로 강제 재검색하는 다른 호출부도 있을 수 있다.
  it("영구 저장 재검색에서도 쿠팡이 세트 상품만 반환하면 추적 중인 완전 일치 상품이 맨 앞에 추가된다", async () => {
    mocks.searchCoupangProducts.mockResolvedValue([bundleCoupangResult]);
    mocks.searchTrackedProducts.mockResolvedValue([pantheneStoredProduct]);
    mocks.upsertCoupangProducts.mockResolvedValue([
      { id: 701, name: bundleCoupangResult.productName, currentPrice: bundleCoupangResult.productPrice, affiliateUrl: bundleCoupangResult.productUrl, externalProductId: "9040457204:1:1", inStock: true, categoryName: "뷰티", variantLabel: null, isRocket: true, isFreeShipping: false },
    ]);
    mocks.saveDeepLinkForProduct.mockResolvedValue(undefined);
    mocks.cacheSearchProducts.mockResolvedValue(undefined);

    const result = await searchCatalogSafely(pantheneKeyword, 10, { forceExternal: true });

    expect(result.source).toBe("coupang");
    expect(result.products[0]?.externalProductId).toBe(pantheneStoredProduct.externalProductId);
  });

  // 가격 갱신 스케줄러(callType: "price-tracking")는 이미 자체 SKU matcher로 정확한
  // 상품만 골라 처리하므로, 이 보호 로직이 함께 끼어들어 결과를 바꾸면 안 된다.
  it("가격 갱신 작업(callType: price-tracking)에는 추적 중인 완전 일치 상품을 끼워 넣지 않는다", async () => {
    mocks.searchCoupangProducts.mockResolvedValue([bundleCoupangResult]);
    mocks.upsertCoupangProducts.mockResolvedValue([
      { id: 701, name: bundleCoupangResult.productName, currentPrice: bundleCoupangResult.productPrice, affiliateUrl: bundleCoupangResult.productUrl, externalProductId: "9040457204:1:1", inStock: true, categoryName: "뷰티", variantLabel: null, isRocket: true, isFreeShipping: false },
    ]);
    mocks.saveDeepLinkForProduct.mockResolvedValue(undefined);
    mocks.cacheSearchProducts.mockResolvedValue(undefined);

    const result = await searchCatalogSafely(pantheneKeyword, 10, { forceExternal: true, callType: "price-tracking" });

    expect(mocks.searchTrackedProducts).not.toHaveBeenCalled();
    expect(result.products.some(product => product.externalProductId === pantheneStoredProduct.externalProductId)).toBe(false);
  });

  // 첫 검색(forceExternal이 없는 일반 검색)은 이 보호 로직의 영향을 받지 않아야 한다 —
  // DB에 아직 아무것도 없는 상태에서 지연 등록 결과를 그대로 반환한다.
  it("forceExternal 없는 일반 지연 등록 검색은 추적 상품 조회를 별도로 하지 않는다", async () => {
    mocks.searchTrackedProducts.mockResolvedValue([]);
    mocks.searchCoupangProducts.mockResolvedValue([bundleCoupangResult]);

    const result = await searchCatalogSafely(pantheneKeyword, 10, { persistNewResults: false });

    expect(result.source).toBe("coupang");
    // 일반 검색에서도 searchTrackedProducts는 DB 커버리지 판단을 위해 한 번은 호출되지만,
    // findExactTrackedMatchForForcedRefresh를 통한 추가 조회(재호출)는 없어야 한다.
    expect(mocks.searchTrackedProducts).toHaveBeenCalledTimes(1);
  });
});
