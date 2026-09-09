import { describe, expect, it } from "vitest";
import { buildCoupangSearchPath, MAX_COUPANG_SEARCH_KEYWORD_LENGTH } from "./coupang";

describe("쿠팡 Search API 경로", () => {
  it("상위 호출자가 긴 검색어를 전달해도 keyword를 50자로 제한한다", () => {
    const path = buildCoupangSearchPath("가".repeat(70), 10);
    const keyword = new URL(`https://example.com${path}`).searchParams.get("keyword");

    expect(MAX_COUPANG_SEARCH_KEYWORD_LENGTH).toBe(50);
    expect(keyword).toHaveLength(50);
  });
});
