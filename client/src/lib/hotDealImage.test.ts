import { describe, expect, it } from "vitest";
import { looksLikeHotDealPageUrl, normalizeHotDealImageUrl } from "./hotDealImage";

describe("normalizeHotDealImageUrl", () => {
  it("http와 // 주소를 https로 올리고 공백을 없앤다", () => {
    expect(normalizeHotDealImageUrl("  http://shop-phinf.pstatic.net/a.jpg ")).toBe("https://shop-phinf.pstatic.net/a.jpg");
    expect(normalizeHotDealImageUrl("//cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
    expect(normalizeHotDealImageUrl(null)).toBe("");
  });
});

describe("looksLikeHotDealPageUrl", () => {
  it("스마트스토어·쿠팡 상품 페이지 주소는 이미지 주소가 아니라고 판단한다", () => {
    expect(looksLikeHotDealPageUrl("https://smartstore.naver.com/store/products/123")).toBe(true);
    expect(looksLikeHotDealPageUrl("https://www.coupang.com/vp/products/123")).toBe(true);
  });
  it("이미지 CDN 주소는 통과시킨다", () => {
    expect(looksLikeHotDealPageUrl("https://shop-phinf.pstatic.net/20261014/a.jpg?type=f640")).toBe(false);
    expect(looksLikeHotDealPageUrl("https://thumbnail.coupangcdn.com/thumbnails/a.jpg")).toBe(false);
  });
});
