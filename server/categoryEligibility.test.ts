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

  // 2026-09-18: 쿠팡트래블(trip.coupang.com) 상품은 카테고리·상품명에 "숙박"이
  // 없어도(예: "OO 호텔&리조트", "체크인시 랜덤배정") URL 자체로 무조건 제외돼야
  // 한다. 실제로 수집됐던 두 사례로 검증한다.
  it("excludes any trip.coupang.com product by URL alone, regardless of category or name text", () => {
    expect(
      isExcludedTrackingCategory({
        pageType: "list",
        name: "쏘타스위트 양양그랑베이★와우회원 특가★24년 오픈 신상호텔, 낙산해수욕장 바로 앞",
        url: "https://trip.coupang.com/tp/products/10000010810170?vendorItemId=70000149653380&itemId=20002055493033",
      }),
    ).toBe(true);
    expect(
      isExcludedTrackingCategory({
        categoryName: undefined,
        productName: "[단독특가] 라테라스 호텔&리조트★오션뷰 수영장★~11월까지 예약가능",
        url: "https://trip.coupang.com/tp/products/102304578?vendorItemId=70000286031530&itemId=20002211554910",
      }),
    ).toBe(true);
    // 옵션명(예: "체크인시 랜덤배정(한실or블루...)")만 봐서는 텍스트 패턴에 전혀
    // 안 걸리지만, URL이 trip.coupang.com이면 그래도 제외돼야 한다.
    expect(
      isExcludedTrackingCategory({
        pageType: "detail",
        name: "체크인시 랜덤배정(한실or블루룸)",
        url: "https://trip.coupang.com/tp/products/102304578",
      }),
    ).toBe(true);
  });

  it("does not exclude a normal coupang.com product just because its name mentions trip-like words", () => {
    expect(
      isExcludedTrackingCategory({
        pageType: "detail",
        name: "호텔식 침구 세트 리조트룩 원피스 아님 그냥 침구",
        url: "https://www.coupang.com/vp/products/1234567?itemId=1&vendorItemId=1",
      }),
    ).toBe(false);
  });
});
