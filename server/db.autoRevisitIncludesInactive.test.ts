import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = readFileSync(join(process.cwd(), "server/db.ts"), "utf8");

// 2026-09-16: 자동 순회(백그라운드 재방문) 후보 선정이 원래 isActive: true인 상품만
// 대상으로 삼았다. 그런데 확장의 "삭제된 상품 보고 → 완전 삭제" 기능이 생긴 뒤에도,
// isActive: false로 비활성화된 상품은 애초에 후보에서 빠지니 확장이 다시 방문할 일이
// 없어서 영원히 "비활성(만료 감지)" 상태로만 남는 문제가 있었다. 이제 삭제가
// 되돌릴 수 없는 완전 삭제이므로, 비활성 상품도 후보에 포함시켜 자동 순회가 다시
// 방문하게 한다 — 실제로 사라진 상품이면 완전 삭제되고, 아직 살아있으면 정상
// 관측이 쌓이며 활성 상태로 돌아온다.
describe("가신 수집기 자동 순회 후보 — isActive 상태와 무관하게 포함", () => {
  it("getStaleTrackedProductsForExtensionRevisit이 더 이상 isActive: true로 후보를 제한하지 않는다", () => {
    const fnStart = db.indexOf("export async function getStaleTrackedProductsForExtensionRevisit");
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = db.indexOf("\n}", fnStart);
    const fnBody = db.slice(fnStart, fnEnd);

    expect(fnBody).toContain("inArray(products.source, EXTENSION_AUTO_REVISIT_SOURCES)");
    expect(fnBody).toContain("lt(products.lastSeenAt, staleBefore)");
    expect(fnBody).not.toContain("eq(products.isActive, true)");
  });
});
