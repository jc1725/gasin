import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(join(process.cwd(), "client/src/pages/AdminPrices.tsx"), "utf8");
const db = readFileSync(join(process.cwd(), "server/db.ts"), "utf8");

// 2026-09-16: "현재 가격 추이 상품" 검색은 스케줄러가 가격 갱신·알림 대상으로 쓰는
// listAllTrackedProducts()(활성 상품만)와 달리, 가신 수집기가 "삭제/만료된 상품"으로
// 판정해 isActive: false로 비활성화한 상품까지 포함한 전체 상품을 대상으로 해야 한다 —
// 관리자가 그런 상품도 검색해서 검토하거나 영구 삭제할 수 있어야 하기 때문이다. 또한
// 가격이 가장 오래 갱신되지 않은 상품부터 보이도록 lastSeenAt 오름차순 정렬을 유지한다.
describe("admin current price trend covers the whole catalog", () => {
  it("queries every product regardless of isActive, ordered stalest-first", () => {
    expect(db).toContain("export async function listCurrentPriceProductsForAdmin");
    expect(db).toContain("return db.select().from(products).orderBy(asc(products.lastSeenAt));");
  });

  it("lets admins permanently delete inactive/expired products found in that search", () => {
    expect(db).toContain("const product = (await tx.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1))[0];");
    expect(db).toContain("const existingProducts = await tx.select({ id: products.id }).from(products).where(inArray(products.id, uniqueIds));");
    expect(db).toContain("inArray(products.id, existingIds)");
  });

  it("marks inactive/expired rows in the admin list and blocks 품절 on them", () => {
    expect(page).toContain("비활성·만료 감지 상품까지 포함한 전체 상품");
    expect(page).toContain("가격 갱신이 오래된 상품부터 표시");
    expect(page).toContain("비활성(만료 감지)");
    expect(page).toContain("product.isActive === false");
  });
});
