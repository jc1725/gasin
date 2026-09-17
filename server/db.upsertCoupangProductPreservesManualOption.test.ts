import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = readFileSync(join(process.cwd(), "server/db.ts"), "utf8");

describe("공식 Coupang Partners API upsert — 관리자 수동 옵션 보호 + 재입고 반영", () => {
  it("관리자가 수동으로 채운 옵션 정보(optionMetadataSource==='manual')가 있으면 보존한다", () => {
    const fn = db.slice(db.indexOf("export async function upsertCoupangProduct"));
    const body = fn.slice(0, fn.indexOf("\nexport ", 50));
    // 2026-09-17: 예전엔 조건 없이 항상 describeProductVariant(공식 API의 product.productName만
    // 파싱)의 결과로 덮어써서, 관리자가 고친 값이 사라지거나(상품명에 규격이 없으면
    // variant.*가 통째로 null이 되어 기존 값까지 지워짐) 하는 문제가 있었다.
    expect(body).toContain('existing?.optionMetadataSource === "manual"');
    expect(body).toContain("hasProtectedManualOption ? existing!.variantLabel : variant.variantLabel");
    expect(body).toContain("hasProtectedManualOption ? existing!.unitLabel : variant.unitLabel");
    // unitLabel을 보존할 때도 unitPrice는 새 가격 기준으로 다시 계산해 짝을 맞춘다.
    expect(body).toMatch(/hasProtectedManualOption\s*\n?\s*\? Math\.round\(currentPrice \/ \(preservedQuantity \?\? 1\)\)/);
  });

  it("공식 API가 유효 가격과 함께 상품을 돌려주면 inStock을 재입고로 갱신한다", () => {
    const fn = db.slice(db.indexOf("export async function upsertCoupangProduct"));
    const body = fn.slice(0, fn.indexOf("\nexport ", 50));
    // 2026-09-17: 예전엔 이 upsert가 inStock을 전혀 갱신하지 않아서, 수집기가 품절로
    // 저장한 상품은 공식 API에 다시 나타나도 계속 품절로 남아있는 버그가 있었다.
    expect(body).toContain("inStock: currentPrice > 0,");
    expect(body).toContain("inStock: values.inStock,");
  });
});
