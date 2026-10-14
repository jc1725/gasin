import { describe, expect, it } from "vitest";
import { getGoogleDriveFileId, looksLikeHotDealPageUrl, normalizeHotDealImageUrl } from "./hotDealImage";

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

describe("구글 드라이브 공유 링크", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
  it("공유 링크의 파일 ID로 이미지 직접 주소를 만든다", () => {
    expect(normalizeHotDealImageUrl(`https://drive.google.com/file/d/${id}/view?usp=sharing`)).toBe(`https://lh3.googleusercontent.com/d/${id}`);
    expect(normalizeHotDealImageUrl(`https://drive.google.com/open?id=${id}`)).toBe(`https://lh3.googleusercontent.com/d/${id}`);
    expect(normalizeHotDealImageUrl(`https://drive.google.com/uc?export=view&id=${id}`)).toBe(`https://lh3.googleusercontent.com/d/${id}`);
  });
  it("파일 ID가 없는 드라이브 주소는 변환하지 않는다", () => {
    expect(getGoogleDriveFileId("https://drive.google.com/drive/folders/abc")).toBeNull();
    expect(getGoogleDriveFileId("https://example.com/file/d/" + id)).toBeNull();
  });
});
