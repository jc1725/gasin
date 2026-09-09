import { describe, expect, it } from "vitest";
import { normalizeCoupangProduct } from "./coupang";

describe("normalizeCoupangProduct", () => {
  it("retains only the approved minimum fields needed for price tracking", () => {
    const product = normalizeCoupangProduct({
      productId: 123,
      productName: "  테스트 상품 ",
      productPrice: 15000,
      productImage: "https://image.example/item.jpg",
      productUrl: "https://www.coupang.com/vp/products/123",
      categoryName: "생활",
      isRocket: true,
      isFreeShipping: false,
      internalCustomerId: "must-not-persist",
      analyticsPayload: { secret: true },
    });
    expect(product).toEqual({
      productId: 123,
      productName: "테스트 상품",
      productPrice: 15000,
      productImage: "https://image.example/item.jpg",
      productUrl: "https://www.coupang.com/vp/products/123",
      categoryName: "생활",
      isRocket: true,
      isFreeShipping: false,
    });
  });
});
