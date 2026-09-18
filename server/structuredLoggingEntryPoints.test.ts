import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 2026-09-18: "가신 코딩 스킬 다이제스트"(관측성/계측 항목) 적용 — 이 세 엔트리포인트는
// 이전엔 사람이 읽기 위한 console.log/error 접두사 문자열만 남겨서, 같은 하위 로직이
// 어느 경로(스케줄러/외부 cron/수집기 확장)로 실행됐는지 로그만으로 구분할 수 없었다.
// server/_core/log.ts의 구조화 로그 헬퍼로 바꾼 지점이 실제로 남아있는지 소스 텍스트로
// 확인한다(이 파일들은 db.ts를 가져오거나 Express 앱 전체를 필요로 해 여기서 직접
// 실행하며 테스트하기는 무겁다 — server/_core/log.test.ts가 헬퍼 자체의 동작은 검증함).
describe("구조화 로그 헬퍼가 여러 진입점에 연결되어 있다", () => {
  it("scheduledJobs.ts의 createHandler가 route: scheduler로 잡 시작/성공/실패를 남긴다", () => {
    const src = readFileSync(join(process.cwd(), "server/scheduledJobs.ts"), "utf8");
    expect(src).toContain('import { logError, logInfo } from "./_core/log"');
    expect(src).toContain('logInfo("scheduled_job_start", "scheduler", { jobKey });');
    expect(src).toContain('logInfo("scheduled_job_success", "scheduler"');
    expect(src).toContain('logError("scheduled_job_failed", "scheduler"');
  });

  it("externalPriceRefresh.ts의 두 라우트가 route: external_cron으로 시작/성공/실패를 남긴다", () => {
    const src = readFileSync(join(process.cwd(), "server/externalPriceRefresh.ts"), "utf8");
    expect(src).toContain('import { logError, logInfo } from "./_core/log"');
    expect(src).toContain('logInfo("external_price_refresh_start", "external_cron"');
    expect(src).toContain('logInfo("external_price_refresh_success", "external_cron"');
    expect(src).toContain('logError("external_price_refresh_failed", "external_cron"');
    expect(src).toContain('logInfo("external_favorites_refresh_start", "external_cron"');
    expect(src).toContain('logInfo("external_favorites_refresh_success", "external_cron"');
    expect(src).toContain('logError("external_favorites_refresh_failed", "external_cron"');
  });

  it("collectionRoutes.ts의 /api/collect가 route: collector_extension으로 검증 실패·성공·실패를 남긴다", () => {
    const src = readFileSync(join(process.cwd(), "server/collectionRoutes.ts"), "utf8");
    expect(src).toContain('import { logError, logInfo, logWarn } from "./_core/log"');
    // 스키마 검증 실패 — 실제 스크래핑 값(상품명 등)은 남기지 않고 itemCount/issuePaths만 남긴다.
    expect(src).toContain('logWarn("collect_payload_invalid", "collector_extension"');
    expect(src).not.toMatch(/logWarn\("collect_payload_invalid"[^)]*\bname\b/);
    // 배치 성공 요약 — 집계 수치만 담고 개별 상품 식별자는 남기지 않는다.
    expect(src).toContain('logInfo("collect_batch_success", "collector_extension"');
    expect(src).toContain('logError("collect_batch_failed", "collector_extension"');
  });
});
