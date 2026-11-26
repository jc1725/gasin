import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = readFileSync(join(process.cwd(), "server/db.ts"), "utf8");

// 2026-11-26: 수집기 자동 순회 방문 순서 — ① 찜 → ② 옵션 미확인 → ③ 수집기 확인 대기 → ④ 나머지,
// 같은 단계 안에서는 가장 오래 확인되지 않은 순.
describe("가신 수집기 자동 순회 후보 우선순위", () => {
  const fnStart = db.indexOf("export async function getStaleTrackedProductsForExtensionRevisit");
  const fnBody = db.slice(fnStart, db.indexOf("\n}", fnStart));
  const orderStart = fnBody.indexOf(".orderBy(");
  const orderBody = fnBody.slice(orderStart, fnBody.indexOf(".limit(", orderStart));

  it("찜한 상품을 맨 앞에 둔다", () => {
    expect(orderBody).toContain("WHEN EXISTS (SELECT 1 FROM ${favorites} WHERE ${favorites.productId} = ${products.id}) THEN 0");
  });

  it("옵션 미확인 상품을 두 번째, 수집기 확인 대기를 세 번째에 둔다", () => {
    const optionUnknown = orderBody.indexOf("${products.packSize} IS NULL THEN 1");
    const awaiting = orderBody.indexOf("${products.refreshState} = 'awaiting_collection' THEN 2");
    expect(optionUnknown).toBeGreaterThan(-1);
    expect(awaiting).toBeGreaterThan(optionUnknown);
    expect(orderBody).toContain("ELSE 3 END");
  });

  it("같은 단계 안에서는 오래 확인되지 않은 상품부터 방문한다", () => {
    expect(orderBody).toContain("asc(products.lastSeenAt)");
  });
});
