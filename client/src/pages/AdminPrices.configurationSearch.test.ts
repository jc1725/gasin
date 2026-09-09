import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "client/src/pages/AdminPrices.tsx"), "utf8");

describe("구성 정보 없는 보류 상품 검색 지원", () => {
  it("구성이 없으면 구성 입력을 안내하고 저장 전 입력값을 쿠팡 검색어에 반영한다", () => {
    expect(source).toContain('hasConfiguration ? "수정" : "구성 입력"');
    expect(source).toContain("구성 정보를 입력해 정확 SKU 찾기");
    expect(source).toContain("입력값은 저장 전에도 아래 쿠팡 검색어에 반영됩니다");
    expect(source).toContain("createCoupangSearchUrl(product.name, searchQualifiers)");
    expect(source).toContain("입력한 구성으로 쿠팡 검색");
  });

  it("저장된 구성도 편집하지 않은 상태에서 쿠팡 검색어에 포함한다", () => {
    expect(source).toContain(": [optionDisplayLabel, metaTags.capacity, metaTags.packSize, metaTags.quantity]");
  });
});
