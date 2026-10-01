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

    // 2026-10-01: 재계산식이 `현재가 ÷ 수량`이라 용량을 아예 쓰지 않았다. 라벨만
    // "10ml당"을 붙이니 40ml짜리 6,000원 상품이 "10ml당 6,000원"(실제 1,500원)으로
    // 저장됐다. 용량까지 보는 공용 계산식을 쓴다.
    expect(body).toContain("computeStoredUnitPrice(");
    expect(body).not.toMatch(/currentPrice\s*\/\s*effectiveQuantity/);
    // 라벨이나 용량을 읽을 수 없으면 단가를 비운다(틀린 단가보다 낫다).
    expect(body).toContain(": null");

    // 재계산된 unitPrice가 실제로 update 대상에 포함되어야 한다 — 예전엔 unitLabel만
    // set하고 unitPrice는 손대지 않아서 옛 값이 그대로 남는 버그가 있었다.
    // 2026-10-01: 제품 그룹키를 붙이는 withMergedProductGroupKey 래퍼를 통과하도록 바뀌었다.
    // 래퍼 이름까지 함께 확인해서, 갱신 객체가 그룹키 계산을 건너뛰고 .set()으로 바로
    // 들어가는 회귀도 같이 잡는다.
    expect(body).toMatch(/\.set\(withMergedProductGroupKey\([^;]*unitPrice[^;]*\)\)/);
  });
});

// 2026-10-01: 같은 잘못된 식(`현재가 ÷ 수량`)이 공식 API upsert 경로에도 있었다.
// optionMetadataSource 기본값이 "manual"이라 보존 분기가 사실상 모든 추적 행에 걸려
// 있었고, 가격이 갱신될 때마다 용량을 무시한 단가로 덮어쓰고 있었다.
describe("upsert 보존 분기의 unitPrice 재계산", () => {
  const body = readFileSync(join(process.cwd(), "server/db.ts"), "utf8");

  it("라벨을 보존할 때도 용량까지 보는 공용 계산식을 쓴다", () => {
    const anchor = body.indexOf("unitPrice: preserveUnitLabel");
    expect(anchor).toBeGreaterThan(-1);
    const scoped = body.slice(anchor, anchor + 600);
    expect(scoped).toContain("computeStoredUnitPrice(");
    expect(scoped).not.toMatch(/currentPrice\s*\/\s*\(preservedQuantity/);
  });

  it("db.ts 어디에도 수량만으로 나누는 단가 계산이 남아 있지 않다", () => {
    expect(body).not.toMatch(/Math\.round\(\s*currentPrice\s*\/\s*\(?\s*(?:preservedQuantity|effectiveQuantity)/);
    expect(body).not.toMatch(/Math\.round\(\s*existing\.currentPrice\s*\/\s*effectiveQuantity/);
  });
});
