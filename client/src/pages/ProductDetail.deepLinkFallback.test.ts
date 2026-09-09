import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "client/src/pages/ProductDetail.tsx"), "utf8");

describe("상품 상세 무효 딥링크 대체 경로", () => {
  it("정확 SKU 미일치·실패 링크에는 쿠팡 검색 대체 경로를 표시한다", () => {
    expect(source).toContain('product.deepLinkStatus === "failed"');
    expect(source).toContain('product.refreshState === "awaiting_collection"');
    expect(source).toContain("판매 상태 확인 필요");
    expect(source).toContain("쿠팡에서 같은 상품 검색");
    expect(source).toContain("noopener noreferrer");
  });

  it("최근 수집기가 확인한 정확 SKU는 제휴 딥링크 생성 실패에도 원본 상품 경로를 유지한다", () => {
    expect(source).toContain('import { hasCollectorVerifiedPurchasePath } from "@/lib/collectorVerifiedPurchase"');
    expect(source).toContain("const hasCollectorVerifiedPath = hasCollectorVerifiedPurchasePath(product);");
    expect(source).toContain("수집기가 최근 확인한 정확 옵션 상품 경로입니다. 제휴 딥링크는 생성 대기 중입니다.");
    expect(source).toContain("href={product.affiliateUrl!}");
  });
});
