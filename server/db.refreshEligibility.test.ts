import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = readFileSync(join(process.cwd(), "server/db.ts"), "utf8");
const jobs = readFileSync(join(process.cwd(), "server/scheduledJobs.ts"), "utf8");

function bodyOf(source: string, marker: string) {
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("\n}", start));
}

// 2026-10-01: 가격 갱신 대상이 상품 수만큼 끝없이 늘어나는 문제를 줄이기 위해, 로켓
// 계열이 아닌 상품은 사용자가 찜을 해두었을 때만 가격을 갱신한다.
describe("가격 갱신 대상 — 로켓 계열이거나 찜한 상품만", () => {
  it("공용 조건은 isRocket 이거나 favorites에 한 건이라도 있는 상품이다", () => {
    const body = bodyOf(db, "export function refreshEligibleCondition");
    expect(body).toContain("eq(products.isRocket, true)");
    expect(body).toContain("EXISTS (SELECT 1 FROM ${favorites}");
    expect(body).toContain("${favorites.productId} = ${products.id}");
  });

  it("서버 가격 재확인 후보(getDeferredSearchProducts)에 조건이 걸려 있다", () => {
    expect(bodyOf(db, "export async function getDeferredSearchProducts")).toContain("refreshEligibleCondition()");
  });

  it("수집기 자동 순회 후보에 조건이 걸려 있다", () => {
    expect(bodyOf(db, "export async function getStaleTrackedProductsForExtensionRevisit")).toContain("refreshEligibleCondition()");
  });

  it("listAllTrackedProducts는 refreshableOnly일 때만 조건을 건다(Drive 백업은 전체)", () => {
    const body = bodyOf(db, "export async function listAllTrackedProducts");
    expect(body).toContain("options.refreshableOnly");
    expect(body).toContain("and(eq(products.isActive, true), refreshEligibleCondition())");
    // 옵션이 없으면 예전처럼 활성 상품 전체다.
    expect(body).toContain(": eq(products.isActive, true)");
  });

  it("골드박스 갱신과 3분 가격 갱신이 대상 목록을 refreshableOnly로 받는다", () => {
    const calls = jobs.match(/listAllTrackedProducts\(\{ refreshableOnly: true \}\)/g) ?? [];
    expect(calls).toHaveLength(2);
    // Drive 백업만 전체 목록을 쓴다.
    expect(jobs.match(/listAllTrackedProducts\(\)/g) ?? []).toHaveLength(1);
  });
});
