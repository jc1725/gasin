import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const home = fs.readFileSync(path.join(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

describe("홈 프라이스 디코딩 포지셔닝", () => {
  // 2026-10-01 리뉴얼 1단계: 히어로를 "쿠팡 가기 전, 가신 한번." 포지셔닝으로 교체했다.
  it("쿠팡 가기 전 가격 확인 메시지와 와우회원가·가격 이력 비교를 히어로에 제공한다", () => {
    expect(home).toContain("쿠팡 살 때,");
    expect(home).toContain("그냥 들어가지 마세요.");
    expect(home).toContain("쿠팡 가기 전, 가신 한번.");
    expect(home).toContain("<GiveSummary />");
    expect(home).toContain("와우회원가와 가격 이력");
    expect(home).toContain("가격을 해독하세요");
  });
});
