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

  // 2026-09-22: 쿠팡 접속은 딥링크로만 한다 — 가신이 직접 조립한 원본 경로(affiliateUrl)로
  // 구매 버튼을 열지 않고, 딥링크가 없으면 "딥링크 준비 중"을 보여준다.
  it("딥링크가 없을 때 원본 쿠팡 경로(affiliateUrl)로 대체하지 않는다", () => {
    expect(source).not.toContain("href={product.affiliateUrl");
    expect(source).toContain("href={product.deepLinkUrl}");
    expect(source).toContain("딥링크 준비 중");
  });
});
