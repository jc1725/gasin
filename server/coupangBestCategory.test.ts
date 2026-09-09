import { describe, expect, it } from "vitest";
import { buildBestCategoryPath, COUPANG_BEST_CATEGORY_IDS } from "./coupang";

describe("Coupang best category request", () => {
  it("uses only official supported category IDs and keeps each category response bounded", () => {
    expect(COUPANG_BEST_CATEGORY_IDS).toHaveLength(19);
    expect(buildBestCategoryPath(1016, 4)).toBe("/v2/providers/affiliate_open_api/apis/openapi/products/bestcategories/1016?limit=4&imageSize=230x230");
    expect(buildBestCategoryPath(1016, 100)).toContain("limit=10");
    expect(() => buildBestCategoryPath(9999, 4)).toThrow("지원하지 않는 쿠팡 카테고리 코드입니다.");
  });
});
