import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Home.tsx", import.meta.url), "utf8");

describe("Home Coupang widget", () => {
  it("renders the requested affiliate iframe and keeps the main search entry separate", () => {
    expect(source).toContain('href="/search"');
    expect(source).toContain('src="https://coupa.ng/cphOHP"');
    expect(source).toContain('title="쿠팡 상품 위젯"');
    expect(source).toContain('referrerPolicy="unsafe-url"');
    // 2026-10-01: 위젯 위에는 위젯 설명과 파트너스 고지만 둔다(클릭 유도 문구 금지).
    expect(source).toContain("이 검색창은 쿠팡 파트너스 활동의 일환으로, 이를 통한 구매에 대해 가신이 일정액의 수수료를 받아요.");
    expect(source).not.toContain("적립됩니다");
    expect(source).not.toContain("COUPANG SEARCH");
  });
});
