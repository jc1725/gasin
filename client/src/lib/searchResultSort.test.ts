import { describe, expect, it } from "vitest";
import { sortSearchResultProducts } from "./searchResultSort";

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
});
