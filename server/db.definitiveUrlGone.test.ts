import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = readFileSync(join(process.cwd(), "server/db.ts"), "utf8");
const routes = readFileSync(join(process.cwd(), "server/collectionRoutes.ts"), "utf8");

// 2026-09-16: 처음엔 확장의 DOM 휴리스틱 오탐 가능성 때문에 isActive: false로 소프트
// 비활성화만 했었고, 이후 "URL이 사라져서 없는 상품입니다" 문구일 때만 완전 삭제하는
// 중간 단계를 거쳤다. 사용자가 실제 삭제 상품 페이지(쿠팡의 "상품을 찾을 수
// 없습니다" 안내 + 확장의 "삭제된 상품으로 보고함" 배지)로 감지가 정확히 동작하는
// 것을 직접 확인한 뒤 "확인되면 무조건 삭제"로 정책을 바꿨다 — 이제 감지된 문구
// 내용과 무관하게 보고되면 항상 완전 삭제한다(문구별 분기 없음).
describe("가신 수집기의 '삭제된 상품' 보고 — 조건 없이 완전 삭제", () => {
  it("메시지 내용과 무관하게 항상 완전 삭제한다 — 더 이상 isActive 소프트 비활성화로 분기하지 않음", () => {
    expect(db).toContain("export async function deleteProductsReportedGoneByExtension");
    expect(db).toContain("await db.delete(manualLinkTracks).where(inArray(manualLinkTracks.productId, targetIds));");
    expect(db).toContain("await db.delete(products).where(inArray(products.id, targetIds));");
    expect(db).not.toContain("isActive: false, lastRefreshReason: reason");
    expect(db).not.toContain("DEFINITIVE_URL_GONE_PATTERN");
    expect(db).not.toContain("deactivateProductsReportedGoneByExtension");
  });

  it("/api/collect/gone 라우트가 새 함수와 완전 삭제 결과만 사용한다", () => {
    expect(routes).toContain("db.deleteProductsReportedGoneByExtension(parsed.data)");
    expect(routes).toContain("result.deletedCount");
    expect(routes).not.toContain("deactivateProductsReportedGoneByExtension");
    expect(routes).not.toContain("result.deactivatedCount");
  });
});
