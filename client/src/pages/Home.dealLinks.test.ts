import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Home.tsx", import.meta.url), "utf8");

describe("Home deal list links", () => {
  it("홈에서 가격 내린 상품·저점 근접 상품 목록으로 가는 링크를 제공한다", () => {
    expect(source).toContain('href="/deals/drops"');
    expect(source).toContain('href="/deals/low"');
    expect(source).toContain("최근 7일 가격이 내린 상품");
    expect(source).toContain("90일 가격 저점 근접 상품");
  });

  it("'최저가' 광고 문구를 쓰지 않는다", () => {
    const block = source.slice(source.indexOf('aria-label="가격 변화 모아보기"'), source.indexOf("COUPANG CATEGORY BEST"));
    expect(block).not.toContain("최저가");
  });
});
