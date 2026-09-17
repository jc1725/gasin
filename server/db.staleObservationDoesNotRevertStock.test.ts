import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = readFileSync(join(process.cwd(), "server/db.ts"), "utf8");

// 2026-09-17: wowMemberPriceObservedAt은 "판매 중 + 가격 확인됨" 관측에서만 갱신되고
// 품절 관측에서는 갱신되지 않는다. 그런데도 "최신 관측 시각" 판단에서 lastSeenAt
// (모든 관측에서 항상 갱신됨)보다 우선했기 때문에, "9시 판매 중 → 12시 품절 확인 →
// 지연 도착한 10시 판매 중 데이터" 순서에서 10시 데이터가 이미 확인된 12시 품절
// 상태를 되돌릴 수 있었다. lastSeenAt만 기준으로 삼아야 한다.
describe("지연 도착한 수집 관측이 더 최신인 품절 상태를 되돌리지 않는다", () => {
  it("수집기 관측 반영(정상 경로)이 lastSeenAt만을 최신 관측 기준으로 쓴다", () => {
    expect(db).toContain("const latestPriceObservationAt = current.lastSeenAt;");
    expect(db).not.toContain("const latestPriceObservationAt = current.wowMemberPriceObservedAt ?? current.lastSeenAt;");
  });

  it("동시 등록 경합(레이스) 처리 경로도 lastSeenAt만을 기준으로 쓴다", () => {
    expect(db).toContain("const racedLatestObservationAt = raced.lastSeenAt;");
    expect(db).not.toContain("const racedLatestObservationAt = raced.wowMemberPriceObservedAt ?? raced.lastSeenAt;");
  });

  it("관리자 수동 확인 가격 저장 경로도 같은 이유로 lastSeenAt만을 기준으로 쓴다", () => {
    expect(db).toContain("const latestPriceObservationAt = product.lastSeenAt;");
    expect(db).not.toContain("const latestPriceObservationAt = product.wowMemberPriceObservedAt ?? product.lastSeenAt;");
  });
});
