import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = readFileSync(join(process.cwd(), "server/db.ts"), "utf8");

// 2026-09-17: unitPrice는 항상 collectionVariant.unitPrice(100g/10ml 등 정규화된
// 기준으로 계산됨)를 쓰면서, unitLabel은 수집기가 관측한 상품 전체 용량
// (capacityText, 예: "1kg")을 그대로 쓰던 버그가 있었다. "100g당" 기준으로 계산된
// 가격에 "1kg" 라벨이 붙어 실제보다 10배 싸 보이는 표시("1kg당 260원" 등)로
// 이어졌다. unitLabel도 반드시 collectionVariant.unitLabel로 맞춰서 unitPrice와
// 항상 같은 기준을 가리키게 해야 한다.
describe("가신 수집기 관측 반영 — unitLabel은 항상 unitPrice와 같은 정규화 기준을 쓴다", () => {
  it("신규 상품 등록 경로가 capacityText가 아닌 collectionVariant.unitLabel을 저장한다", () => {
    expect(db).toContain("unitLabel: collectedOptionIsCompatible ? collectionVariant.unitLabel : null,");
    expect(db).not.toContain("unitLabel: collectedOptionIsCompatible ? capacityText ?? collectionVariant.unitLabel : null,");
  });

  it("레거시 검색 SKU 승격 경로가 capacityText가 아닌 collectionVariant.unitLabel을 저장한다", () => {
    expect(db).toContain("unitLabel: collectedOptionIsCompatible && collectionVariant.unitLabel ? collectionVariant.unitLabel : legacySearchProduct.unitLabel,");
    expect(db).not.toContain("unitLabel: collectedOptionIsCompatible && capacityText ? capacityText : legacySearchProduct.unitLabel,");
  });

  it("기존 상품 갱신 경로가 unitPrice·unitLabel을 항상 같은 조건으로 함께 갱신한다", () => {
    expect(db).toContain("unitLabel: effectivePrice > 0 && collectionVariant.unitPrice !== null && canReplaceMetadata ? collectionVariant.unitLabel : current.unitLabel,");
    expect(db).not.toContain("unitLabel: capacityText && canReplaceMetadata ? capacityText : current.unitLabel,");
  });
});
