import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(join(process.cwd(), "client/src/pages/AdminPrices.tsx"), "utf8");
const router = readFileSync(join(process.cwd(), "server/routers.ts"), "utf8");
const db = readFileSync(join(process.cwd(), "server/db.ts"), "utf8");

describe("admin price trend management", () => {
  it("removes the price trend CSV download and exposes product management API", () => {
    expect(page).not.toContain("현재 가격 추이 CSV 다운로드");
    expect(page).toContain("현재 가격 추이 상품");
    expect(page).toContain("markCurrentPriceProductSoldOut");
    expect(page).toContain("deleteCurrentPriceProduct");
    expect(router).toContain("listCurrentPriceProducts");
    expect(router).toContain("markCurrentPriceProductSoldOut");
    expect(router).toContain("deleteCurrentPriceProduct");
    expect(db).toContain("listCurrentPriceProductsForAdmin");
    expect(db).toContain("markTrackedProductSoldOutForAdmin");
    expect(db).toContain("deleteTrackedProductForAdmin");
  });

  it("limits price trend, missing search, and deferred cards to ten per page", () => {
    expect(page).toContain("const ADMIN_PAGE_SIZE = 10");
    expect(page).toContain("currentPricePageItems");
    expect(page).toContain("missingSearchPageItems");
    expect(page).toContain("deferredPageItems");
    expect(page).toContain('label="현재 가격 추이"');
    expect(page).toContain('label="검색 실패 이력"');
    expect(page).toContain('label="보류 상품"');
    expect(page).toContain("상품명, 쿠팡 SKU, 옵션·용량·수량 검색");
  });
});
