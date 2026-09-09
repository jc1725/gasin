import { describe, expect, it } from "vitest";
import { normalizeCoupangDeepLinkUrls } from "./coupang";

describe("deep link reuse policy", () => {
  it("deduplicates batch URLs before sending them to the Coupang deep-link API", () => {
    expect(normalizeCoupangDeepLinkUrls([" https://www.coupang.com/vp/products/1 ", "https://www.coupang.com/vp/products/1", "https://www.coupang.com/vp/products/2"])).toEqual([
      "https://www.coupang.com/vp/products/1",
      "https://www.coupang.com/vp/products/2",
    ]);
  });
});
