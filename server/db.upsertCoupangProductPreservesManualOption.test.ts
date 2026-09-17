import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = readFileSync(join(process.cwd(), "server/db.ts"), "utf8");

describe("공식 Coupang Partners API upsert — 기존 옵션(관리자 수동 + 수집기 관측) 보호 + 재입고 반영", () => {
  it("관리자가 수동으로 채운 옵션 정보(optionMetadataSource==='manual')가 있으면 보존한다", () => {
    const fn = db.slice(db.indexOf("export async function upsertCoupangProduct"));
    const body = fn.slice(0, fn.indexOf("\nexport ", 50));
    expect(body).toContain('existing?.optionMetadataSource === "manual"');
    expect(body).toContain("preserveVariantLabel ? existing!.variantLabel : variant.variantLabel");
    expect(body).toContain("preserveUnitLabel ? existing!.unitLabel : variant.unitLabel");
    expect(body).toMatch(/preserveUnitLabel\s*\n?\s*\? Math\.round\(currentPrice \/ \(preservedQuantity \?\? 1\)\)/);
  });

  it("수집기(가신 확장 프로그램)가 채운 옵션 정보(optionMetadataSource==='collection')도 보존한다", () => {
    const fn = db.slice(db.indexOf("export async function upsertCoupangProduct"));
    const body = fn.slice(0, fn.indexOf("\nexport ", 50));
    // 2026-09-17 추가 수정: 처음엔 "manual"만 보호해서, 골드박스/검색/베스트카테고리
    // 상품을 수집기로 재방문해 채운 옵션 정보(optionMetadataSource==="collection")가
    // 다음 공식 API 정기 갱신 때 여전히 사라질 수 있었다. describeProductVariant는
    // 상품명만 보고 파싱해서 관리자 입력·수집기 관측보다 신뢰도가 낮으므로, 둘 다
    // 보호 대상에 포함해야 한다.
    expect(body).toContain('existing?.optionMetadataSource === "collection"');
    expect(body).toMatch(/optionMetadataSource === "manual"\s*\|\|\s*existing\?\.optionMetadataSource === "collection"/);
  });

  it("variantLabel/unitLabel/quantity 중 일부만 채워져 있어도, 채워진 필드만 개별적으로 보호한다 (전부-아니면-전무 아님)", () => {
    const fn = db.slice(db.indexOf("export async function upsertCoupangProduct"));
    const body = fn.slice(0, fn.indexOf("\nexport ", 50));
    // 2026-09-17 세 번째 수정: 예전엔 variantLabel·unitLabel·quantity가 "전부" 채워져
    // 있어야만 보호했다 (`&& Boolean(existing.variantLabel) && Boolean(existing.unitLabel)
    // && existing.quantity !== null`을 한 덩어리 hasProtectedExistingOption으로 묶음).
    // 세 필드 중 일부만 채워진 상품(흔한 케이스)은 보호 조건이 깨져서 이미 채워진
    // 값까지 함께 지워졌다. 이제 각 필드가 독립적으로 자신의 존재 여부만으로 보호
    // 여부를 결정해야 한다 — 즉 세 개의 별도 플래그로 분리되어 있어야 한다.
    expect(body).toContain("const isProtectedMetadataSource = existing?.optionMetadataSource");
    expect(body).toContain("const preserveVariantLabel = isProtectedMetadataSource && Boolean(existing.variantLabel);");
    expect(body).toContain("const preserveUnitLabel = isProtectedMetadataSource && Boolean(existing.unitLabel);");
    expect(body).toContain("const preserveQuantity = isProtectedMetadataSource && existing.quantity !== null;");
    // 더 이상 세 필드를 하나의 전부-아니면-전무 플래그로 묶지 않는다.
    expect(body).not.toContain("hasProtectedExistingOption");
    // unitLabel·unitPrice는 서로 다른 기준끼리 짝이 어긋나면 안 되므로(예: "100g당"
    // 가격에 "1kg" 라벨) 항상 같은 조건(preserveUnitLabel) 하나로 함께 결정되어야 한다.
    expect(body).toContain("quantity: preservedQuantity,");
    expect(body).toContain("const preservedQuantity = preserveQuantity ? existing!.quantity : variant.quantity;");
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
