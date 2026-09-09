import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "client/src/components/ProductCard.tsx"), "utf8");

describe("검색 상품 카드 구성·최저가 표시", () => {
  it("shows capacity and quantity together without inventing a missing quantity", () => {
    expect(source).toContain('const compositionLabel = [metaTags.capacity ? `용량 ${metaTags.capacity}` : null, quantityLabel ? `수량 ${quantityLabel}` : null]');
    expect(source).toContain('product.quantity && product.quantity > 0 ? `${product.quantity}개` : metaTags.quantity');
  });

  it("marks only an exact current-price and lowest-price match as the lowest price", () => {
    expect(source).toContain('product.currentPrice === product.lowestPrice');
    expect(source).not.toContain('product.currentPrice <= product.lowestPrice');
  });
});
