import { describe, expect, it } from "vitest";
import { buildCoupangSearchPath } from "./coupang";

describe("Coupang product-search path", () => {
  it("sends the keyword, bounded limit, image size, and explicit SRP result mode", () => {
    const url = new URL(`https://api-gateway.coupang.com${buildCoupangSearchPath("케라스타즈 샴푸", 10)}`);
    expect(url.pathname).toBe("/v2/providers/affiliate_open_api/apis/openapi/products/search");
    expect(url.searchParams.get("keyword")).toBe("케라스타즈 샴푸");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("imageSize")).toBe("230x230");
    expect(url.searchParams.get("srpLinkOnly")).toBe("false");
  });
});
