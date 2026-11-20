import { describe, expect, it } from "vitest";
import { getDominantUnitLabel, sortSearchResultProducts } from "./searchResultSort";

const products = [
  { id: 1, name: "비플레인 클렌징폼 80ml", imageUrl: "", currentPrice: 8_640, lowestPrice: 8_640, variantLabel: "80ml × 1개", unitPrice: null, unitLabel: null, source: "search" as const, isRocket: false, isFreeShipping: false },
  { id: 2, name: "비플레인 클렌징폼 40ml", imageUrl: "", currentPrice: 6_000, lowestPrice: 6_000, variantLabel: "40ml × 1개", unitPrice: null, unitLabel: null, source: "search" as const, isRocket: false, isFreeShipping: false },
  { id: 3, name: "가격 미확인", imageUrl: "", currentPrice: 0, lowestPrice: 0, variantLabel: null, unitPrice: null, unitLabel: null, source: "search" as const, isRocket: false, isFreeShipping: false },
];

describe("sortSearchResultProducts", () => {
  it("keeps server relevance order by default", () => {
    expect(sortSearchResultProducts(products, "relevance").map(product => product.id)).toEqual([1, 2, 3]);
  });

  it("puts known prices first in ascending price order", () => {
    expect(sortSearchResultProducts(products, "priceAsc").map(product => product.id)).toEqual([2, 1, 3]);
  });

  describe("unitPriceAsc", () => {
    const item = (id: number, currentPrice: number, unitPrice: number | null, unitLabel: string | null) => ({ ...products[0]!, id, name: `상품 ${id}`, currentPrice, lowestPrice: currentPrice, unitPrice, unitLabel });

    it("가장 많은 단가 기준끼리 단가 오름차순으로 세우고, 나머지는 관련도 순서 그대로 뒤에 둔다", () => {
      const list = [
        item(1, 10000, 1000, "100g"),
        item(2, 3000, 300, "10ml"), // 기준이 다름 → 뒤
        item(3, 16000, 800, "100g"),
        item(4, 5000, null, null), // 단가 없음 → 뒤
        item(5, 6000, 1200, "100g"),
      ];
      expect(sortSearchResultProducts(list, "unitPriceAsc").map(product => product.id)).toEqual([3, 1, 5, 2, 4]);
    });

    it("단가가 같으면 현재가, 그다음 관련도 순서로 정한다", () => {
      const list = [item(1, 12000, 800, "100g"), item(2, 9000, 800, "100g"), item(3, 9000, 800, "100g")];
      expect(sortSearchResultProducts(list, "unitPriceAsc").map(product => product.id)).toEqual([2, 3, 1]);
    });

    it("기준이 동률이면 관련도 순서상 먼저 나온 기준을 쓴다", () => {
      const list = [item(1, 3000, 300, "10ml"), item(2, 10000, 1000, "100g")];
      expect(getDominantUnitLabel(list)).toBe("10ml");
    });

    it("단가를 가진 상품이 하나도 없으면 입력 순서 그대로 돌려주고 기준은 null이다", () => {
      expect(getDominantUnitLabel(products)).toBeNull();
      expect(sortSearchResultProducts(products, "unitPriceAsc").map(product => product.id)).toEqual([1, 2, 3]);
    });
  });
});
