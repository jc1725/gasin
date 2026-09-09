import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ProductCard.tsx", import.meta.url), "utf8");

describe("ProductCard collection source label", () => {
  it("hides the collector-source placeholder while retaining actual option labels", () => {
    expect(source).toContain('product.variantLabel?.trim() === "가신 수집기 상품" ? null : product.variantLabel');
    expect(source).toContain("getProductOptionDisplayLabel(displayVariantLabel, product.unitLabel)");
    expect(source).toContain("{optionDisplayLabel}");
  });
});
