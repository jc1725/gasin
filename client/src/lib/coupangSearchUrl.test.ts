import { describe, expect, it } from "vitest";
import { createCoupangProductUrl, createCoupangSearchUrl } from "./coupangSearchUrl";

describe("createCoupangProductUrl", () => {
  it("상품 ID·itemId·vendorItemId를 상품 상세 URL에 순서대로 넣는다", () => {
    expect(createCoupangProductUrl("329389373", "12155685032", "95791858631"))
      .toBe("https://www.coupang.com/vp/products/329389373?itemId=12155685032&vendorItemId=95791858631");
  });

  it("옵션 ID가 없으면 상품 상세 URL만 만든다", () => {
    expect(createCoupangProductUrl("8984414870", null, null))
      .toBe("https://www.coupang.com/vp/products/8984414870");
  });
});

describe("createCoupangSearchUrl", () => {
  it("공백을 정리해 쿠팡 검색 대체 경로를 만든다", () => {
    expect(createCoupangSearchUrl("  CNP차앤박   앰플  "))
      .toBe("https://www.coupang.com/np/search?q=CNP%EC%B0%A8%EC%95%A4%EB%B0%95%20%EC%95%B0%ED%94%8C");
  });

  it("관리자가 입력한 옵션·용량·수량을 검색어에 함께 넣는다", () => {
    expect(createCoupangSearchUrl("제주삼다수 그린 무라벨", ["2L", "6개"]))
      .toBe("https://www.coupang.com/np/search?q=%EC%A0%9C%EC%A3%BC%EC%82%BC%EB%8B%A4%EC%88%98%20%EA%B7%B8%EB%A6%B0%20%EB%AC%B4%EB%9D%BC%EB%B2%A8%202L%206%EA%B0%9C");
  });

  it("저장된 옵션에 이미 들어 있는 용량·수량은 한 번만 넣는다", () => {
    expect(createCoupangSearchUrl("피지오겔 데일리 모이스처 테라피", ["200ml 2개", "200ml", "2개"]))
      .toBe("https://www.coupang.com/np/search?q=%ED%94%BC%EC%A7%80%EC%98%A4%EA%B2%94%20%EB%8D%B0%EC%9D%BC%EB%A6%AC%20%EB%AA%A8%EC%9D%B4%EC%8A%A4%EC%B2%98%20%ED%85%8C%EB%9D%BC%ED%94%BC%20200ml%202%EA%B0%9C");
  });
});
