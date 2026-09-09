import { describe, expect, it } from "vitest";
import { buildPriceRefreshSearchKeyword } from "./priceRefreshSearchQuery";

describe("가격 갱신 Search API 검색어", () => {
  it("상품명에 없는 옵션·규격·수량을 함께 넣는다", () => {
    expect(buildPriceRefreshSearchKeyword({
      name: "퀸센스 인덕션 라면 편수냄비",
      variantLabel: "혼합색상",
      unitLabel: "20cm",
      quantity: 1,
    })).toBe("퀸센스 인덕션 라면 편수냄비 혼합색상 20cm 1개");
  });

  it("상품명 또는 옵션명에 이미 있는 구성값은 중복하지 않는다", () => {
    expect(buildPriceRefreshSearchKeyword({
      name: "퀸센스 인덕션 라면 편수냄비 혼합색상 20cm 1개",
      variantLabel: "혼합색상 20cm 1개",
      unitLabel: "20cm",
      quantity: 1,
    })).toBe("퀸센스 인덕션 라면 편수냄비 혼합색상 20cm 1개");
  });

  it("빈 구성 정보는 상품명 검색을 유지하고 검색어 길이를 제한한다", () => {
    expect(buildPriceRefreshSearchKeyword({ name: "  테스트   상품  ", variantLabel: "가신 수집기 상품" })).toBe("테스트 상품");
    expect(buildPriceRefreshSearchKeyword({ name: "가".repeat(100), quantity: 1 })).toHaveLength(50);
  });
});
