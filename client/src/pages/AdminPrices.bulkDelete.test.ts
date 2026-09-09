import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(join(process.cwd(), "client/src/pages/AdminPrices.tsx"), "utf8");
const router = readFileSync(join(process.cwd(), "server/routers.ts"), "utf8");
const db = readFileSync(join(process.cwd(), "server/db.ts"), "utf8");

describe("admin current price bulk delete", () => {
  it("provides page selection and a guarded bulk delete action", () => {
    expect(page).toContain("selectedCurrentPriceIds");
    expect(page).toContain("현재 페이지 전체 선택");
    expect(page).toContain("선택 상품");
    expect(page).toContain("deleteSelectedCurrentProducts");
    expect(page).toContain("영구 삭제할까요?");
  });

  it("exposes an admin-only bounded bulk delete contract", () => {
    expect(router).toContain("deleteCurrentPriceProducts: adminProcedure");
    expect(router).toContain("z.array(z.number().int().positive()).min(1).max(100)");
    expect(router).toContain("deleteTrackedProductsForAdmin(input.productIds)");
    expect(db).toContain("export async function deleteTrackedProductsForAdmin");
    expect(db).toContain("inArray(products.id, activeIds)");
  });
});

