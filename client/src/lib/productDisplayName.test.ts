import { describe, expect, it } from "vitest";
import { getProductDisplayName, getProductOptionDisplayLabel } from "./productDisplayName";

describe("getProductDisplayName", () => {
  it("상품명에 반복된 옵션·용량·수량은 제목에서 제거하고 전용 태그에 맡긴다", () => {
    expect(getProductDisplayName(
      "비플레인 녹두 약산성 클렌징폼 폼클렌징 160ml x 4개, 4개, 160ml",
      "160ml × 4개",
    )).toBe("비플레인 녹두 약산성 클렌징폼 폼클렌징");
  });

  it("옵션 없는 단일 SKU의 상품명은 변경하지 않는다", () => {
    expect(getProductDisplayName("쿠쿠 W8300 공기청정기", null)).toBe("쿠쿠 W8300 공기청정기");
  });

  it("옵션 문구에서는 구성값을 제거하고 실제 옵션명만 남긴다", () => {
    expect(getProductOptionDisplayLabel("160ml × 4개")).toBeNull();
    expect(getProductOptionDisplayLabel("무향, 160ml × 4개")).toBe("무향");
  });
});
