import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./AdminPrices.tsx", import.meta.url), "utf8");

describe("administrator automatic recheck queue summary", () => {
  it("keeps manual input and automatic recheck counts visibly separate", () => {
    expect(source).toContain("수동 가격 입력 필요");
    expect(source).toContain("자동 재확인 대상");
    expect(source).toContain("지금 처리");
    expect(source).toContain("수집기 확인 대기");
    expect(source).toContain("정확 SKU 미일치는 수집기 관측 대기로 전환됩니다.");
    expect(source).toContain("외부 자동 실행은 검색 등록·활성·재고 보유 상품을 최대 10개씩 처리합니다.");
  });
});
