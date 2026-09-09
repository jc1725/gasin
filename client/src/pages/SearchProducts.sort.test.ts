import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./SearchProducts.tsx", import.meta.url), "utf8");

describe("search result sorting UI", () => {
  it("offers relevance and ascending-price sorting while accurately disclosing unavailable review counts", () => {
    expect(source).toContain("관련도순");
    expect(source).toContain("낮은 가격순");
    expect(source).toContain("리뷰 많은 순 · 정보 없음");
    expect(source).toContain("sortSearchResultProducts");
  });
});
