import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { DONATION_RATE_PCT, GIVE_FORBIDDEN_PHRASES, GIVE_PROMISE, describePayoutStatus } from "../shared/give";

// 2026-10-01 리뉴얼 1단계: 기부 문구 린트. 기획안 17항(금지 표현)과 쿠팡 파트너스
// 운영정책 4.1 2)(클릭유도 문구) 때문에, 기부를 구매·클릭에 묶거나 개인별 기부를
// 단정하는 표현이 소스에 들어오면 실패한다. 금지 목록 자체가 있는 파일과 이 테스트는 제외.
const ROOTS = ["client/src", "server", "shared"];
const EXCLUDED = new Set(["shared/give.ts", "server/giveCopy.test.ts"]);

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const fullPath = join(dir, name);
    if (name === "node_modules") return [];
    if (statSync(fullPath).isDirectory()) return listSourceFiles(fullPath);
    return /\.(ts|tsx)$/.test(name) ? [fullPath] : [];
  });
}

describe("GASIN GIVE 문구", () => {
  it("약속 문구는 '실제 지급받은 쿠팡 파트너스 수익금(세후)의 30%'를 정확히 말한다", () => {
    expect(DONATION_RATE_PCT).toBe(30);
    expect(GIVE_PROMISE).toContain("실제 지급받은 쿠팡 파트너스 수익금(세후)");
    expect(GIVE_PROMISE).toContain("30%");
    expect(GIVE_PROMISE).not.toContain("구매금액");
  });

  it("소스 어디에도 금지 표현이 없다", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of listSourceFiles(join(process.cwd(), root))) {
        const relativePath = relative(process.cwd(), file).split("\\").join("/");
        if (EXCLUDED.has(relativePath)) continue;
        const source = readFileSync(file, "utf8");
        for (const phrase of GIVE_FORBIDDEN_PHRASES) {
          if (source.includes(phrase)) offenders.push(`${relativePath}: ${phrase}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("정산 예정일(한국 시간) 당일까지는 '정산 대기', 다음 날부터는 '정산 확인 중'으로 표시한다", () => {
    expect(describePayoutStatus("2026-10-15", new Date("2026-10-15T23:59:00+09:00"))).toBe("정산 대기");
    expect(describePayoutStatus("2026-10-15", new Date("2026-10-16T00:00:00+09:00"))).toBe("정산 확인 중");
  });
});
