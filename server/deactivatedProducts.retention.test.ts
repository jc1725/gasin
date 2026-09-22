import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const jobs = readFileSync(new URL("./scheduledJobs.ts", import.meta.url), "utf8");
const core = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");

// 2026-09-22: "기존 수집된 SKU 이걸 삭제하지않고 자동으로 숨겨줘 => 이관되면 기존내용은
// 숨김 처리하고, 90일 지나면 삭제할것" — SKU 이관(supersedeSearchSkusWithCollectorObservation),
// 관리자 수동 병합(mergeDuplicateProductsForAdmin), 골드박스 일일 갱신 탈락
// (deactivateStaleProductsForSource)으로 isActive: false가 되는 시점을 deactivatedAt에
// 기록하고, 90일 뒤 자동 삭제(deleteExpiredInactiveProducts)한다.
describe("이관·병합·골드박스 탈락으로 비활성화된 상품의 90일 뒤 자동 삭제", () => {
  it("products 테이블에 deactivatedAt 컬럼과 조회용 인덱스가 있다", () => {
    expect(schema).toContain('deactivatedAt: timestamp("deactivatedAt"),');
    expect(schema).toContain('index("products_isActive_deactivatedAt_idx").on(table.isActive, table.deactivatedAt)');
  });

  it("isActive: false로 바뀌는 세 지점 모두 deactivatedAt을 함께 기록한다", () => {
    // SKU 재발급 이관
    expect(db).toContain("deactivatedAt: occurredAt,");
    // 관리자 수동 병합
    expect(db).toContain("deactivatedAt: new Date(),");
    // 골드박스 일일 갱신 탈락
    expect(db).toContain('.set({ isActive: false, deactivatedAt: new Date() })');
  });

  it("isActive: true로 되살아나는 지점은 deactivatedAt을 함께 비운다", () => {
    const reactivationSites = db.split("deactivatedAt: null,").length - 1;
    expect(reactivationSites).toBe(2);
  });

  it("deleteExpiredInactiveProducts는 deactivatedAt이 없는 레거시 비활성 행은 건드리지 않는다", () => {
    expect(db).toContain("export async function deleteExpiredInactiveProducts(expiryBefore: Date)");
    expect(db).toContain("isNotNull(products.deactivatedAt)");
    expect(db).toContain("lt(products.deactivatedAt, expiryBefore)");
  });

  it("retention 작업(90일 가격 이력 정리)이 90일 지난 비활성 상품 삭제도 함께 수행한다", () => {
    expect(jobs).toContain("db.deleteExpiredInactiveProducts(expiry)");
  });

  it("retention은 cron-job.org 별도 설정 없이 3분 heartbeat에 하루 1회 게이팅되어 실행된다", () => {
    expect(jobs).toContain("export async function runRetentionDailySchedule(now: Date = new Date())");
    expect(jobs).toContain("RETENTION_RUN_INTERVAL_MS = 24 * 60 * 60 * 1000");
    expect(core).toContain("runRetentionDailySchedule()");
  });
});
