import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SYNC_RUN_DETAIL_MAX_LENGTH, truncateSyncRunDetail } from "./db";

// 2026-10-01: 추적 상품이 1만 8천 개를 넘자 deferSearchProductRefresh가 자리표시자
// 2만 7천 개짜리 UPDATE를 만들어 실패했고, 3분마다 도는 가격 갱신 작업이 통째로
// 죽어 있었다. 실패 사유를 기록하는 finishSyncRun마저 그 거대한 문자열을 text
// 컬럼(64KB)에 넣다 또 실패해서 원인이 두 겹으로 가려졌다.
describe("대량 상품에서도 가격 갱신 대기열이 죽지 않는다", () => {
  const body = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

  it("deferSearchProductRefresh가 ID를 배치로 쪼개 실행한다", () => {
    const fn = body.slice(body.indexOf("export async function deferSearchProductRefresh"));
    const scoped = fn.slice(0, fn.indexOf("\n}\n") + 3);
    expect(scoped).toContain("DEFER_REFRESH_ID_CHUNK_SIZE");
    expect(scoped).toContain("productIds.slice(offset, offset + DEFER_REFRESH_ID_CHUNK_SIZE)");
    // 전체 목록을 그대로 IN 절에 넣으면 안 된다.
    expect(scoped).not.toContain("inArray(products.id, productIds)");
  });

  it("실패 사유가 아무리 길어도 기록 자체는 성공하도록 잘라 저장한다", () => {
    const huge = "?, ".repeat(40_000);
    const stored = truncateSyncRunDetail(huge)!;
    expect(stored.length).toBeLessThan(SYNC_RUN_DETAIL_MAX_LENGTH + 100);
    expect(stored).toContain("앞부분만 기록");
  });

  it("짧은 사유와 빈 사유는 그대로 둔다", () => {
    expect(truncateSyncRunDetail("정상 처리 12개")).toBe("정상 처리 12개");
    expect(truncateSyncRunDetail(undefined)).toBeNull();
  });
});
