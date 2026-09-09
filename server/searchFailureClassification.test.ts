import { describe, expect, it } from "vitest";
import { classifyMissingSearch, classifyMissingSearchResult } from "./searchFailureClassification";

describe("search failure classification", () => {
  it("classifies numeric Coupang product IDs separately from product-name failures", () => {
    expect(classifyMissingSearch("8771412756")).toMatchObject({
      category: "product_id",
      label: "상품 ID 검색어",
      optionSummary: null,
    });
  });

  it("classifies a product name with size as product plus option", () => {
    expect(classifyMissingSearch("비플레인 클렌징폼 80ml")).toMatchObject({
      category: "option",
      label: "상품명 + 옵션",
      optionSummary: "80ml",
    });
  });

  it("classifies product-type searches separately from brand-name searches", () => {
    expect(classifyMissingSearch("아이오페 수분 크림")).toMatchObject({ category: "product_type", label: "상품 유형·표기" });
    expect(classifyMissingSearch("아이오페 히아루로닉")).toMatchObject({ category: "brand", label: "브랜드·상품명" });
  });

  it("overrides the inferred category when the API explicitly returned unrelated results", () => {
    expect(classifyMissingSearchResult("아이오페 수분 크림", "쿠팡 공식 API가 검색어와 무관한 결과만 반환했습니다.")).toMatchObject({
      category: "relevance",
      label: "관련도 탈락",
    });
  });

  it("shows package and quantity tokens in the option summary", () => {
    expect(classifyMissingSearch("오뚜기 육개장 컵 104g 18개")).toMatchObject({
      category: "option",
      optionSummary: "104g · 18개",
    });
  });
});
