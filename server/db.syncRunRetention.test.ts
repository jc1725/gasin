import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SYNC_RUN_PRUNE_CHUNK_SIZE, SYNC_RUN_RETENTION_DAYS } from "./db";

// 2026-10-01: syncRuns에는 보존 정책이 아예 없었다. 가격 갱신 주기를 3분에서 1분으로
// 올리면서 증가 속도가 3배가 된다 — 작업 자체 1,440행에 보호 모드 기록이 실행마다
// 최대 2행씩 더해져 하루 4천 행대다. detail이 최대 4,000자 text라 무게도 가볍지 않다.
describe("작업 실행 기록 보존 정책", () => {
  const dbBody = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  const jobsBody = readFileSync(new URL("./scheduledJobs.ts", import.meta.url), "utf8");

  it("가격 이력(90일)보다 짧은 보존 기간을 쓴다", () => {
    expect(SYNC_RUN_RETENTION_DAYS).toBeGreaterThan(0);
    expect(SYNC_RUN_RETENTION_DAYS).toBeLessThan(90);
  });

  it("pruneSyncRuns가 한 번에 전부 지우지 않고 나눠 지운다", () => {
    const fn = dbBody.slice(dbBody.indexOf("export async function pruneSyncRuns"));
    const scoped = fn.slice(0, fn.indexOf("\n}\n") + 3);
    expect(scoped).toContain("SYNC_RUN_PRUNE_CHUNK_SIZE");
    expect(scoped).toContain(".limit(SYNC_RUN_PRUNE_CHUNK_SIZE)");
    // 지울 행이 남지 않았으면 더 돌지 않는다.
    expect(scoped).toContain("if (affected < SYNC_RUN_PRUNE_CHUNK_SIZE) break;");
    expect(SYNC_RUN_PRUNE_CHUNK_SIZE).toBeGreaterThan(0);
  });

  it("보존 정책 정리 작업이 작업 실행 기록도 함께 태운다", () => {
    const fn = jobsBody.slice(jobsBody.indexOf("export async function removeExpiredPriceHistory"));
    const scoped = fn.slice(0, fn.indexOf("\n}\n") + 3);
    expect(scoped).toContain("db.pruneSyncRuns(");
    // 가격 이력 90일과 같은 기준을 쓰지 않는다 — 전용 상수를 쓴다.
    expect(scoped).toContain("SYNC_RUN_RETENTION_DAYS");
  });
});
