import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const home = fs.readFileSync(path.join(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

describe("홈 프라이스 디코딩 포지셔닝", () => {
  it("가격 의심·와우회원가·가격 이력 비교 메시지를 히어로에 제공한다", () => {
    expect(home).toContain("쿠팡 가격,");
    expect(home).toContain("있는 그대로 믿지 마세요.");
    expect(home).toContain("와우회원가와 가격 이력");
    expect(home).toContain("가격을 해독하세요");
  });
});
