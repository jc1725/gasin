import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "client/src/pages/AdminPrices.tsx"), "utf8");

describe("관리자 무효 딥링크 대체 경로", () => {
  it("실패·수집기 확인 대기 링크는 쿠팡 검색 경로로 안내한다", () => {
    expect(source).toContain('product.deepLinkStatus === "failed"');
    expect(source).toContain('product.refreshState === "awaiting_collection"');
    expect(source).toContain("딥링크 생성 실패 사유");
    expect(source).toContain("다음 조치:");
    expect(source).toContain("쿠팡에서 같은 상품 검색");
    expect(source).toContain("딥링크 갱신");
    expect(source).toContain("productId·itemId·vendorItemId가 모두 일치할 때만 새 링크를 만듭니다");
  });

  it("갱신 결과를 사라지는 알림 대신 해당 상품 카드에 표시한다", () => {
    expect(source).toContain("deepLinkRefreshResults");
    expect(source).toContain("setDeepLinkRefreshResults");
    expect(source).toContain("딥링크 갱신 완료");
    expect(source).toContain("딥링크 갱신 대기");
    expect(source).toContain('role="status"');
    expect(source).not.toContain('result.status === "ready" ? toast.success(result.message) : toast.info(result.message);');
    expect(source).toContain('setDeepLinkRefreshResults(previous => ({ ...previous, [variables.productId]: result }))');
  });

  it("최근 수집기가 확인한 정확 SKU는 관리자 카드에서도 원본 상품 경로를 유지한다", () => {
    expect(source).toContain('import { hasCollectorVerifiedPurchasePath } from "@/lib/collectorVerifiedPurchase"');
    expect(source).toContain("const hasCollectorVerifiedPath = hasCollectorVerifiedPurchasePath(product);");
    expect(source).toContain("product.deepLinkUrl ?? (hasCollectorVerifiedPath ? product.affiliateUrl : null)");
  });

  it("제휴 링크 생성 실패와 수집기 확인 구매 경로 유지를 서로 구분해 표시한다", () => {
    expect(source).toContain('"collector_verified"');
    expect(source).toContain("수집기 확인 구매 경로 유지");
  });
});
