import { describe, expect, it } from "vitest";
import { getExcludedTrackingCategory, isExcludedTrackingCategory } from "./categoryEligibility";

describe("category eligibility", () => {
  it("excludes travel categories even when the product name is generic", () => {
    expect(getExcludedTrackingCategory({ categoryName: "국내투어", name: "종일 종합이용권 1인" })).toBe("여행");
    expect(isExcludedTrackingCategory({ categoryName: "숙박", name: "스탠다드 더블" })).toBe(true);
    expect(isExcludedTrackingCategory({ categoryName: "티켓", name: "콘서트 이용권" })).toBe(true);
  });

  it("uses explicit travel or ticket terms in the name only as a fallback", () => {
    expect(getExcludedTrackingCategory({ name: "제주도 항공권 2인" })).toBe("여행");
    expect(getExcludedTrackingCategory({ name: "테마파크 입장권 1인" })).toBe("티켓");
  });

  it("does not exclude ordinary retail products containing unrelated hotel words", () => {
    expect(isExcludedTrackingCategory({ categoryName: "생활용품", name: "호텔식 수건 5장" })).toBe(false);
    expect(isExcludedTrackingCategory({ categoryName: "주방용품", name: "여행용 파우치" })).toBe(false);
  });
});
