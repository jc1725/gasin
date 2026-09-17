import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = readFileSync(join(process.cwd(), "server/db.ts"), "utf8");

// 2026-09-17: 관리자가 "옵션 수정"에서 용량(unitLabel)을 직접 타이핑해 저장해도
// unitPrice(단위가격)는 전혀 재계산되지 않아서, 라벨과 실제 숫자가 안 맞는 표시가
// 생기던 버그를 계기로 추가됨. 예: "흙대파"를 자동 파싱이 "100g당 260원"으로
// 계산해뒀는데, 관리자가 용량을 "1kg"로 고쳐 저장하면 라벨만 "1kg"로 바뀌고
// unitPrice는 옛날 260이 그대로 남아 "1kg당 260원"(실제 10배 낮은 가격)처럼
// 보이는 문제가 있었다.
describe("관리자 옵션 수정 시 unitPrice(단위가격) 재계산", () => {
  it("updateAdminProductOptionMetadata가 unitLabel/quantity 변경에 맞춰 unitPrice를 함께 재계산한다", () => {
    const fn = db.slice(db.indexOf("export async function updateAdminProductOptionMetadata"));
    const body = fn.slice(0, fn.indexOf("\n}\n") + 3);

    // 현재가(currentPrice)와 기존 수량을 조회해 재계산에 사용해야 한다.
    expect(body).toContain("currentPrice: products.currentPrice");
    expect(body).toContain("quantity: products.quantity");

    // unitLabel이 있을 때만 unitPrice를 계산하고, 없으면(라벨을 지운 경우) 함께 비운다.
    expect(body).toContain("unitLabel && existing");
    expect(body).toContain(": null");

    // 재계산된 unitPrice가 실제로 update 대상에 포함되어야 한다 — 예전엔 unitLabel만
    // set하고 unitPrice는 손대지 않아서 옛 값이 그대로 남는 버그가 있었다.
    expect(body).toMatch(/\.set\(\{[^}]*unitPrice[^}]*\}\)/);
  });
});
