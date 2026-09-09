import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Home.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

describe("Home visual controls", () => {
  it("keeps the requested price-change search copy and removes the brand palette samples", () => {
    expect(source).toContain("가격 변화를 보려면 여기에 검색하세요");
    expect(source).not.toContain("BRAND COLOR");
    expect(source).not.toContain("밝은 초록색 3가지 색상 견본");
    expect(source).not.toContain("brandPalettes");
    expect(appSource).not.toContain("BrandPaletteProvider");
  });
});
