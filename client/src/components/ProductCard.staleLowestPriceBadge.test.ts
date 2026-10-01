import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "client/src/components/ProductCard.tsx"), "utf8");

// 2026-09-17: "최저가" 배지가 마지막 확인 시각과 무관하게 currentPrice===lowestPrice
// 조건만으로 붙어서, 수집이 며칠째 멈춘 상품도 계속 "최저가"로 보이는 문제가 있었다.
// lastSeenAt이 7일보다 오래됐으면 "최저가" 배지 대신 "마지막 확인 {날짜}"를 보여주고,
// 최저가 판정(isLowest) 자체도 신선도를 반영해야 한다.
describe("상품 카드 — 오래된 데이터에는 '최저가' 배지를 붙이지 않는다", () => {
  it("lastSeenAt을 ProductCardItem 타입에 옵션 필드로 포함한다", () => {
    expect(source).toContain("lastSeenAt?: Date | string | null;");
  });

  it("7일 기준 신선도 임계값을 정의하고 lastSeenAt으로부터 isStale을 계산한다", () => {
    expect(source).toContain("const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;");
    expect(source).toContain("const lastSeenAt = product.lastSeenAt ? new Date(product.lastSeenAt) : null;");
    expect(source).toContain(
      "const isStale = Boolean(lastSeenAt && !Number.isNaN(lastSeenAt.getTime()) && Date.now() - lastSeenAt.getTime() > STALE_THRESHOLD_MS);",
    );
  });

  it("isLowest 판정이 isStale을 반영한다(오래된 데이터는 최저가로 취급하지 않는다)", () => {
    expect(source).toContain("const isLowest = hasRecordedPrice && product.currentPrice === product.lowestPrice && !isStale;");
    expect(source).not.toContain("const isLowest = hasRecordedPrice && product.currentPrice === product.lowestPrice;");
  });

  // 2026-10-01: "마지막 확인 {날짜}"는 사용자에게 보일 필요가 없다는 요청으로 표시하지 않는다.
  // 오래된 상품은 isLowest가 false라 "최저가" 배지 대신 "최저 N원"이 나온다.
  it("'마지막 확인 {날짜}'를 사용자에게 보여주지 않는다", () => {
    expect(source).not.toContain("마지막 확인 {");
    expect(source).toContain('{product.inStock === false ? <span className="mb-0.5 text-[10px] font-bold text-[#646b66]">품절</span> : isLowest ? (');
  });
});
