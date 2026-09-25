import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./AdminPrices.tsx", import.meta.url), "utf8");

describe("보류상품 수집기 확인 정보", () => {
  it("보류상품 카드에 쿠팡 상품 ID와 수집할 옵션·용량·수량 구성을 표시한다", () => {
    expect(source).toContain('product.externalProductId.split(":")');
    expect(source).toContain("가신 수집기 확인 정보");
    expect(source).toContain("쿠팡 상품 ID");
    expect(source).toContain("수집할 구성:");
    expect(source).toContain("옵션 ${optionDisplayLabel}");
    expect(source).toContain("용량 ${metaTags.capacity}");
    expect(source).toContain("수량 ${metaTags.quantity}");
  });

  it("이미 저장된 itemId·vendorItemId도 함께 보여 수집기 재확인에 사용한다", () => {
    expect(source).toContain("현재 저장 옵션 SKU:");
    expect(source).toContain("storedItemId && storedVendorItemId");
    expect(source).toContain("수집기에서 선택 옵션을 다시 전송해 주세요.");
  });

  it("쿠팡 상품 ID를 한 번에 복사하고 완료 상태를 표시한다", () => {
    expect(source).toContain("copyCollectorProductId");
    expect(source).toContain("navigator.clipboard?.writeText");
    expect(source).toContain("쿠팡 상품 ID를 복사했습니다.");
    expect(source).toContain("복사됨");
    expect(source).toContain("쿠팡 상품 ID ${coupangProductId || \"미확인\"} 복사");
  });

  it("표시된 쿠팡 상품 ID 관련 링크는 검색 결과가 아닌 상품 상세 페이지를 새 창에서 연다", () => {
    expect(source).not.toContain("coupangProductIdSearchUrl");
    expect(source).not.toContain("ID로 쿠팡 검색");
    expect(source).toContain('href={coupangProductPageUrl ?? "#"}');
    expect(source).toContain("쿠팡 상품 바로가기");
  });

  it("수집기 확인 대기 카드의 쿠팡 상품 ID를 클릭하면 해당 상품 상세 페이지를 새 창에서 연다", () => {
    expect(source).toContain('const coupangProductPageUrl = coupangProductId ? createCoupangProductUrl(coupangProductId, storedItemId, storedVendorItemId) : null;');
    expect(source).toContain('data-testid="collector-product-page-link"');
    expect(source).toContain('href={coupangProductPageUrl}');
    expect(source).toContain("쿠팡 상품 ID ${coupangProductId} 상세 페이지 열기");
  });
});
