import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(join(process.cwd(), "client/src/pages/AdminPrices.tsx"), "utf8");
const router = readFileSync(join(process.cwd(), "server/routers.ts"), "utf8");
const db = readFileSync(join(process.cwd(), "server/db.ts"), "utf8");

describe("admin current price option metadata", () => {
  it("exposes current option, capacity, and quantity fields with an edit action", () => {
    expect(page).toContain("현재 옵션·용량·수량:");
    expect(page).toContain("옵션 수정");
    expect(page).toContain("현재 옵션·용량·수량 수정");
    expect(page).toContain("옵션 정보 저장");
    expect(page).toContain('placeholder="옵션명"');
    expect(page).toContain('placeholder="용량 예: 80ml"');
    expect(page).toContain('placeholder="수량 예: 2"');
  });

  it("passes a validated quantity through the admin API to the product helper", () => {
    expect(router).toContain("quantity: z.number().int().min(1).max(100000).nullable()");
    expect(router).toContain("row.quantity ?? null");
    expect(db).toContain("quantity, optionMetadataSource: \"manual\"");
    expect(db).toContain("export async function updateAdminProductOptionMetadata");
  });
});

