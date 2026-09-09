import { describe, expect, it } from "vitest";
import { normalizeMissingSearchKeyword } from "./db";

describe("normalizeMissingSearchKeyword", () => {
  it("같은 의미의 구분 기호·순서·중복 토큰을 통합한다", () => {
    expect(normalizeMissingSearchKeyword("오뚜기 육개장 컵 104g, 18개 104g 100g 18개"))
      .toBe(normalizeMissingSearchKeyword("오뚜기 육개장 컵 104g 104g 100g 18개"));
    expect(normalizeMissingSearchKeyword("오뚜기 육개장사발면 104g x 24개"))
      .toBe(normalizeMissingSearchKeyword("오뚜기 육개장사발면 104g × 24개"));
  });

  it("수량이 다른 상품은 통합하지 않는다", () => {
    expect(normalizeMissingSearchKeyword("오뚜기 육개장 컵 104g 18개"))
      .not.toBe(normalizeMissingSearchKeyword("오뚜기 육개장 컵 104g 24개"));
  });

  it("폼클렌징 표기 변형을 클렌징폼으로 통합한다", () => {
    expect(normalizeMissingSearchKeyword("비플레인 클렌징폼 80ml"))
      .toBe(normalizeMissingSearchKeyword("비플레인 폼클렌징 80ml"));
  });
});
