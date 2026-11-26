import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn().mockResolvedValue(null) }));

import {
  buildUnitPriceGroups,
  getIndexableUnitPricePaths,
  listUnitPriceGroups,
  resetUnitPriceCacheForTest,
  UNIT_PRICE_INDEX_ENABLED,
  type UnitPriceProductRow,
} from "./unitPriceQueries";

let nextId = 1;
const row = (overrides: Partial<UnitPriceProductRow> = {}): UnitPriceProductRow => {
  const id = overrides.id ?? nextId++;
  return {
    id,
    name: `세제 ${id}`,
    familyKey: "세제",
    familyVariantKey: `세제|${id}`,
    variantLabel: "1kg",
    unitLabel: "100g",
    quantity: 1,
    currentPrice: 10000,
    inStock: true,
    isActive: true,
    refreshState: "fresh",
    categoryName: null,
    lastSeenAt: new Date("2026-11-20T00:00:00Z"),
    ...overrides,
  };
};

beforeEach(() => {
  nextId = 1;
  resetUnitPriceCacheForTest();
});

describe("buildUnitPriceGroups", () => {
  it("같은 상품군의 용량별 구성을 단가 오름차순으로 묶고 차이율을 계산한다", () => {
    // 1kg 10,000원 → 100g당 1,000원 / 2kg 16,000원 → 800원 / 500g 6,000원 → 1,200원
    const groups = buildUnitPriceGroups([
      row({ variantLabel: "1kg", currentPrice: 10000, familyVariantKey: "k1" }),
      row({ variantLabel: "2kg", currentPrice: 16000, familyVariantKey: "k2" }),
      row({ variantLabel: "500g", currentPrice: 6000, familyVariantKey: "k3" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.options.map(option => option.unitPrice)).toEqual([800, 1000, 1200]);
    expect(groups[0]!.savingPct).toBe(33.3);
    expect(groups[0]!.unitLabel).toBe("100g");
  });

  it("저장된 unitPrice가 아니라 현재가·용량으로 다시 계산한다(수량 반영)", () => {
    const groups = buildUnitPriceGroups([
      row({ variantLabel: "1kg", quantity: 1, currentPrice: 10000, familyVariantKey: "a" }),
      row({ variantLabel: "1kg", quantity: 2, currentPrice: 16000, familyVariantKey: "b" }),
    ]);
    expect(groups[0]!.options.map(option => option.unitPrice)).toEqual([800, 1000]);
  });

  it("같은 구성을 파는 여러 판매자 행은 최저가 한 행만 남긴다", () => {
    const groups = buildUnitPriceGroups([
      row({ id: 1, familyVariantKey: "same", currentPrice: 12000 }),
      row({ id: 2, familyVariantKey: "same", currentPrice: 10000 }),
      row({ id: 3, variantLabel: "2kg", currentPrice: 16000, familyVariantKey: "big" }),
    ]);
    expect(groups[0]!.options.map(option => option.productId)).toEqual([3, 2]);
  });

  it("옵션이 하나뿐이거나 단가 차이가 10% 미만이면 제외한다", () => {
    expect(buildUnitPriceGroups([row({ familyVariantKey: "only" })])).toEqual([]);
    expect(
      buildUnitPriceGroups([
        row({ variantLabel: "1kg", currentPrice: 10000, familyVariantKey: "a" }),
        row({ variantLabel: "2kg", currentPrice: 19000, familyVariantKey: "b" }),
      ]),
    ).toEqual([]);
  });

  it("차이가 35%를 넘으면 용량 오인식으로 보고 제외한다(경계값 포함)", () => {
    const build = (bigPrice: number) =>
      buildUnitPriceGroups([
        row({ variantLabel: "1kg", currentPrice: 10000, familyVariantKey: "a" }),
        row({ variantLabel: "2kg", currentPrice: bigPrice, familyVariantKey: "b" }),
      ]);
    expect(build(13000)).toHaveLength(1); // 650 vs 1000 → 35%
    expect(build(12900)).toEqual([]); // 645 vs 1000 → 35.5%
  });

  it("서로 다른 구성의 단가가 정확히 같은 그룹은 통째로 제외한다", () => {
    const groups = buildUnitPriceGroups([
      row({ variantLabel: "1kg", currentPrice: 10000, familyVariantKey: "a" }),
      row({ variantLabel: "2kg", currentPrice: 20000, familyVariantKey: "b" }), // 1,000원으로 a와 같음
      row({ variantLabel: "4kg", currentPrice: 32000, familyVariantKey: "c" }), // 800원
    ]);
    expect(groups).toEqual([]);
  });

  it("세트·기획·리필·증정 상품군은 제외하고 일반 상품군은 남긴다", () => {
    const pair = (familyKey: string) => [
      row({ familyKey, variantLabel: "1kg", currentPrice: 10000, familyVariantKey: `${familyKey}-a` }),
      row({ familyKey, variantLabel: "2kg", currentPrice: 16000, familyVariantKey: `${familyKey}-b` }),
    ];
    for (const familyKey of ["샴푸 2종 세트", "크림 본품+리필", "기획 세제", "사은품 증정 물티슈", "세제 set"]) {
      expect(buildUnitPriceGroups(pair(familyKey))).toEqual([]);
    }
    expect(buildUnitPriceGroups(pair("액체세제"))).toHaveLength(1);
  });

  it("단가 기준(unitLabel)이 다른 행끼리는 비교하지 않는다", () => {
    const groups = buildUnitPriceGroups([
      row({ variantLabel: "1kg", unitLabel: "100g", currentPrice: 10000, familyVariantKey: "a" }),
      row({ variantLabel: "500ml", unitLabel: "100ml", currentPrice: 3000, familyVariantKey: "b" }),
    ]);
    expect(groups).toEqual([]);
  });

  it("용량을 읽지 못한 행, 단독 SKU 키, 품절·비활성·0원은 제외한다", () => {
    const groups = buildUnitPriceGroups([
      row({ variantLabel: "1kg", currentPrice: 10000, familyVariantKey: "a" }),
      row({ variantLabel: "2kg", currentPrice: 16000, familyVariantKey: "b" }),
      row({ variantLabel: null, currentPrice: 1000, familyVariantKey: "c" }),
      row({ variantLabel: "5kg", currentPrice: 1000, familyVariantKey: "sku:99" }),
      row({ variantLabel: "3kg", currentPrice: 1000, familyVariantKey: "d", inStock: false }),
      row({ variantLabel: "4kg", currentPrice: 1000, familyVariantKey: "e", isActive: false }),
      row({ variantLabel: "6kg", currentPrice: 0, familyVariantKey: "f" }),
    ]);
    expect(groups[0]!.options).toHaveLength(2);
  });

  it("제외 카테고리(숙박·여행·티켓)는 뺀다", () => {
    const groups = buildUnitPriceGroups([
      row({ variantLabel: "1kg", currentPrice: 10000, familyVariantKey: "a", categoryName: "여행>항공권" }),
      row({ variantLabel: "2kg", currentPrice: 16000, familyVariantKey: "b", categoryName: "여행>항공권" }),
    ]);
    expect(groups).toEqual([]);
  });

  it("차이율이 큰 그룹이 앞에 오고 그룹당 옵션은 6개까지만 남긴다", () => {
    // 물: i번째 구성은 (i+1)kg, 100g당 1,000 - 300·i/(i+1)원 → 8kg에서 737.5원, 최대 약 26% 차이
    const many = Array.from({ length: 8 }, (_, index) => row({ familyKey: "물", variantLabel: `${index + 1}kg`, currentPrice: 10000 * (index + 1) - index * 3000, familyVariantKey: `w${index}` }));
    // 쌀: 100g당 1,000원 vs 850원 → 15% 차이
    const small = [
      row({ familyKey: "쌀", variantLabel: "1kg", currentPrice: 10000, familyVariantKey: "r1" }),
      row({ familyKey: "쌀", variantLabel: "2kg", currentPrice: 17000, familyVariantKey: "r2" }),
    ];
    const groups = buildUnitPriceGroups([...small, ...many]);
    expect(groups.map(group => group.familyKey)).toEqual(["물", "쌀"]);
    expect(groups[0]!.options).toHaveLength(6);
    expect(groups[0]!.options[0]!.unitPrice).toBeLessThan(groups[0]!.options[5]!.unitPrice);
  });
});

describe("색인 스위치", () => {
  it("UNIT_PRICE_INDEX_ENABLED가 꺼져 있으면 그룹이 충분해도 indexable=false다", () => {
    expect(UNIT_PRICE_INDEX_ENABLED).toBe(false);
  });
});

describe("listUnitPriceGroups", () => {
  it("DB가 없으면 빈 목록과 indexable=false를 돌려주고 sitemap 경로에도 넣지 않는다", async () => {
    const result = await listUnitPriceGroups();
    expect(result.groups).toEqual([]);
    expect(result.indexable).toBe(false);
    expect(await getIndexableUnitPricePaths()).toEqual([]);
  });
});
