import { describe, expect, it } from "vitest";
import type { ProductCardItem } from "@/components/ProductCard";
import { getSearchResultExternalIds, overlayStoredSearchProducts } from "./searchResultFreshness";

function card(overrides: Partial<ProductCardItem>): ProductCardItem {
  return {
    id: null,
    externalProductId: "1:2:3",
    name: "듀이트리 하이 아미노 올 클렌징 밀크",
    imageUrl: "https://example.com/a.jpg",
    currentPrice: 13_070,
    lowestPrice: 13_070,
    variantLabel: null,
    unitPrice: null,
    unitLabel: null,
    source: "search",
    isRocket: true,
    isFreeShipping: false,
    pendingMaterialize: { keyword: "듀이트리", productId: 1, productUrl: "https://link.coupang.com/a/x" },
    ...overrides,
  };
}

describe("검색 결과 카드 최신화", () => {
  it("복원된 API 카드를 같은 SKU의 저장된 최신 행(수집기 가격·옵션)으로 바꾼다", () => {
    const stored = card({ id: 91, currentPrice: 11_100, lowestPrice: 10_850, variantLabel: "400ml, 1개", quantity: 1, lastSeenAt: "2026-11-13T01:46:00.000Z", pendingMaterialize: undefined });
    const [result] = overlayStoredSearchProducts([card({})], [stored]);
    expect(result).toMatchObject({ id: 91, currentPrice: 11_100, variantLabel: "400ml, 1개", pendingMaterialize: null });
  });

  it("저장된 행이 없거나 SKU가 다르면 원래 카드를 유지한다", () => {
    const original = card({});
    expect(overlayStoredSearchProducts([original], [])).toEqual([original]);
    expect(overlayStoredSearchProducts([original], [card({ id: 5, externalProductId: "9:9:9", currentPrice: 1 })])).toEqual([original]);
  });

  it("조회할 SKU 키는 중복 없이 최대 30개만 만든다", () => {
    const items = Array.from({ length: 40 }, (_, index) => card({ externalProductId: `k${index % 35}` }));
    expect(getSearchResultExternalIds(items)).toHaveLength(30);
    expect(getSearchResultExternalIds([card({}), card({})])).toEqual(["1:2:3"]);
  });
});
