import { describe, expect, it } from "vitest";
import { getCoupangVariantKey } from "./coupang";

describe("getCoupangVariantKey", () => {
  it("distinguishes variants with the partner link item and vendor item IDs", () => {
    expect(
      getCoupangVariantKey({
        productId: 12345,
        productUrl: "https://link.coupang.com/re/AFFSDP?pageKey=12345&itemId=123456&vendorItemId=987654",
      })
    ).toBe("12345:123456:987654");
  });

  it("falls back to a URL fingerprint so variants are not merged when item parameters are unavailable", () => {
    const base = { productId: 12345 };
    expect(getCoupangVariantKey({ ...base, productUrl: "https://example.com/product/a" }))
      .not.toBe(getCoupangVariantKey({ ...base, productUrl: "https://example.com/product/b" }));
  });
});
