import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn().mockResolvedValue(null) }));

import {
  buildDealsFromData,
  evaluateDrop,
  evaluateLowZone,
  getIndexableDealPaths,
  listDeals,
  resetDealsCacheForTest,
  type DealProduct,
  type PriceStats,
} from "./dealsQueries";

const stats = (overrides: Partial<PriceStats> = {}): PriceStats => ({ productId: 1, currentPrice: 9000, min90: 8800, max90: 12000, max7: 10000, points: 5, ...overrides });

const row = (overrides: Partial<DealProduct> & { id: number }) =>
  ({
    externalProductId: `p${overrides.id}`,
    name: `상품 ${overrides.id}`,
    imageUrl: "",
    affiliateUrl: "",
    categoryName: null,
    familyKey: null,
    familyVariantKey: null,
    variantLabel: null,
    quantity: null,
    currentPrice: 9000,
    inStock: true,
    isActive: true,
    refreshState: "fresh",
    lastSeenAt: new Date("2026-11-17T00:00:00Z"),
    ...overrides,
  }) as unknown as DealProduct;

describe("evaluateDrop", () => {
  it("5% 이상·500원 이상 하락을 통과시키고 하락률을 소수 첫째 자리로 돌려준다", () => {
    expect(evaluateDrop(stats({ currentPrice: 9000, max7: 10000 }))).toEqual({ referencePrice: 10000, changePct: 10 });
    expect(evaluateDrop(stats({ currentPrice: 9500, max7: 10000 }))).toEqual({ referencePrice: 10000, changePct: 5 });
  });

  it("500원 미만, 5% 미만, 70% 초과 하락은 제외한다", () => {
    expect(evaluateDrop(stats({ currentPrice: 4600, max7: 5000 }))).toBeNull();
    expect(evaluateDrop(stats({ currentPrice: 97000, max7: 100000 }))).toBeNull();
    expect(evaluateDrop(stats({ currentPrice: 2000, max7: 10000 }))).toBeNull();
  });

  it("가격이 오르거나 같으면, 7일 내 기록이 없으면, 기록이 3건 미만이면 제외한다", () => {
    expect(evaluateDrop(stats({ currentPrice: 10000, max7: 10000 }))).toBeNull();
    expect(evaluateDrop(stats({ max7: Number.NaN }))).toBeNull();
    expect(evaluateDrop(stats({ points: 2 }))).toBeNull();
  });
});

describe("evaluateLowZone", () => {
  it("현재가가 90일 최저의 5% 이내이고 90일 변동 폭이 10% 이상이면 통과한다", () => {
    expect(evaluateLowZone(stats({ currentPrice: 9000, min90: 8800, max90: 12000 }))).toEqual({ referencePrice: 12000, changePct: 25 });
  });

  it("최저 대비 5%를 넘게 비싸거나, 변동 폭이 작거나, 기록이 3건 미만이면 제외한다", () => {
    expect(evaluateLowZone(stats({ currentPrice: 9300, min90: 8800, max90: 12000 }))).toBeNull();
    expect(evaluateLowZone(stats({ currentPrice: 9000, min90: 8800, max90: 9200 }))).toBeNull();
    expect(evaluateLowZone(stats({ points: 2 }))).toBeNull();
  });

  it("고점 대비 70% 초과 하락은 데이터 오류로 보고 제외한다", () => {
    expect(evaluateLowZone(stats({ currentPrice: 2000, min90: 2000, max90: 10000 }))).toBeNull();
  });
});

describe("buildDealsFromData", () => {
  it("품절·비활성·제외 카테고리를 빼고 같은 제품 그룹은 최저가 한 행만 남긴다", () => {
    const statsList = [
      stats({ productId: 1, currentPrice: 9000, max7: 10000 }),
      stats({ productId: 2, currentPrice: 9000, max7: 10000 }),
      stats({ productId: 3, currentPrice: 9500, max7: 10500 }),
      stats({ productId: 4, currentPrice: 9000, max7: 10000 }),
      stats({ productId: 5, currentPrice: 9000, max7: 10000 }),
    ];
    const rows = [
      row({ id: 1, name: "생수", familyVariantKey: "생수|500ml|20", currentPrice: 9000 }),
      row({ id: 2, categoryName: "호텔", name: "호텔 숙박권" }),
      row({ id: 3, name: "생수", familyVariantKey: "생수|500ml|20", currentPrice: 9500 }),
      row({ id: 4, inStock: false }),
      row({ id: 5, isActive: false }),
    ];
    const result = buildDealsFromData(statsList, rows);
    expect(result.drops.map(item => item.product.id)).toEqual([1]);
  });

  it("하락률이 큰 순서로 정렬하고 low90·high90을 함께 돌려준다", () => {
    const statsList = [
      stats({ productId: 1, currentPrice: 9000, max7: 10000, min90: 8500, max90: 12000 }),
      stats({ productId: 2, currentPrice: 7000, max7: 10000, min90: 6800, max90: 11000 }),
    ];
    const result = buildDealsFromData(statsList, [row({ id: 1 }), row({ id: 2 })]);
    expect(result.drops.map(item => item.product.id)).toEqual([2, 1]);
    expect(result.drops[0]).toMatchObject({ changePct: 30, low90: 6800, high90: 11000 });
  });
});

describe("listDeals without database", () => {
  beforeEach(() => resetDealsCacheForTest());

  it("DB가 없으면 빈 목록과 indexable=false를 돌려주고 sitemap 경로도 비어 있다", async () => {
    const result = await listDeals("drops");
    expect(result.items).toEqual([]);
    expect(result.indexable).toBe(false);
    expect(await getIndexableDealPaths()).toEqual([]);
  });
});
