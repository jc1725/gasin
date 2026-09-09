import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Home.tsx", import.meta.url), "utf8");

describe("Home category best featured products", () => {
  it("shows official category-best products with a GoldBox fallback instead of the generic recent tracking list", () => {
    expect(source).toContain("catalog.homeFeatured.useQuery({ limit: 50 })");
    expect(source).toContain("카테고리 베스트 상품");
    expect(source).toContain("골드박스 전체보기");
    expect(source).not.toContain("최근 가격 추적 상품");
  });
});
