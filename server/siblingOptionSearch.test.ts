import { describe, expect, it } from "vitest";
import type { CoupangProduct } from "./coupang";
import { buildSiblingSearchKeyword, extractCoupangProductId, hasProductInResults, selectSiblingOptions } from "./siblingOptionSearch";

const item = (productId: number, vendorItemId: number, name: string, price: number): CoupangProduct => ({
  productId,
  productName: name,
  productPrice: price,
  productImage: "https://example.com/a.jpg",
  productUrl: `https://link.coupang.com/re/AFFSDP?pageKey=${productId}&itemId=${vendorItemId - 1}&vendorItemId=${vendorItemId}`,
});

describe("buildSiblingSearchKeyword", () => {
  it("끝의 수량 표기를 떼어 옵션이 섞이지 않은 검색어를 만든다", () => {
    expect(buildSiblingSearchKeyword("호주산 뿌리는 배즙 프로폴리스 스프레이 비타네이처 비타라온 35ml, 1개"))
      .toBe("호주산 뿌리는 배즙 프로폴리스 스프레이 비타네이처 비타라온 35ml");
  });
  it("수량 표기가 없으면 그대로 두고 50자로 자른다", () => {
    expect(buildSiblingSearchKeyword("비타라온 35ml")).toBe("비타라온 35ml");
    expect(buildSiblingSearchKeyword("가".repeat(80)).length).toBe(50);
  });
});

describe("extractCoupangProductId", () => {
  it("externalProductId에서 productId만 꺼낸다", () => {
    expect(extractCoupangProductId("9055194562:26580141276:95822414031")).toBe("9055194562");
  });
});

describe("hasProductInResults", () => {
  it("응답에 같은 productId가 있으면 true", () => {
    expect(hasProductInResults("100", [item(100, 1001, "a", 1)])).toBe(true);
    expect(hasProductInResults("100", [item(200, 2001, "b", 1)])).toBe(false);
  });
});

describe("selectSiblingOptions", () => {
  const known = [item(100, 1001, "비타라온 35ml, 1개", 15000)];

  it("같은 productId의 모르는 옵션만 고른다", () => {
    const candidates = [item(100, 1001, "비타라온 35ml, 1개", 15000), item(100, 1002, "비타라온 35ml, 2개", 27000)];
    expect(selectSiblingOptions(candidates, "100", known).map(s => s.productPrice)).toEqual([27000]);
  });
  it("다른 productId(다른 상품)는 절대 받지 않는다", () => {
    expect(selectSiblingOptions([item(999, 9991, "다른 프로폴리스", 9900)], "100", known)).toEqual([]);
  });
  it("후보 안의 같은 옵션 중복은 하나만 남긴다", () => {
    const candidates = [item(100, 1002, "비타라온 35ml, 2개", 27000), item(100, 1002, "비타라온 35ml, 2개", 27000)];
    expect(selectSiblingOptions(candidates, "100", known)).toHaveLength(1);
  });
});
