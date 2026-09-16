import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(join(process.cwd(), "client/src/pages/AdminPrices.tsx"), "utf8");
const router = readFileSync(join(process.cwd(), "server/routers.ts"), "utf8");
const db = readFileSync(join(process.cwd(), "server/db.ts"), "utf8");

describe("admin current price bulk delete", () => {
  it("provides page selection, whole-search-result selection, and a guarded bulk delete action", () => {
    expect(page).toContain("selectedCurrentPriceIds");
    expect(page).toContain("현재 페이지 전체 선택");
    expect(page).toContain("검색 결과 전체 선택");
    expect(page).toContain("currentPriceFilteredIds");
    expect(page).toContain("allCurrentFilteredSelected");
    expect(page).toContain("선택 상품");
    expect(page).toContain("deleteSelectedCurrentProducts");
    expect(page).toContain("영구 삭제할까요?");
  });

  // 2026-09-16: 선택 개수가 서버 배치 한도(CURRENT_PRICE_DELETE_BATCH_SIZE)를 넘으면
  // 여러 번 나눠 호출해야 검색 결과 전체(수천~수만 개)를 한 번에 삭제할 수 있다.
  it("batches large selections instead of sending them in a single request", () => {
    expect(page).toContain("CURRENT_PRICE_DELETE_BATCH_SIZE = 500");
    expect(page).toContain("deleteCurrentPriceProducts.mutateAsync");
    expect(page).toContain("bulkDeleteProgress");
  });

  it("exposes an admin-only bounded bulk delete contract that matches the client's batch size", () => {
    expect(router).toContain("deleteCurrentPriceProducts: adminProcedure");
    expect(router).toContain("z.array(z.number().int().positive()).min(1).max(500)");
    expect(router).toContain("deleteTrackedProductsForAdmin(input.productIds)");
    expect(db).toContain("export async function deleteTrackedProductsForAdmin");
    expect(db).toContain("inArray(products.id, activeIds)");
  });
});

