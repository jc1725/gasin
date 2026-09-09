import { describe, expect, it, vi } from "vitest";
import { parseCoupangLink, resolveCoupangLink } from "./manualLink";

describe("parseCoupangLink", () => {
  it("extracts the stable product and option identifiers from a partner link", () => {
    const parsed = parseCoupangLink("https://link.coupang.com/re/AFFSDP?pageKey=12345&itemId=123456&vendorItemId=987654");
    expect(parsed.externalProductId).toBe("12345:123456:987654");
    expect(parsed.linkKey).toHaveLength(64);
  });

  it("rejects links that are not Coupang product or partner links", () => {
    expect(() => parseCoupangLink("https://example.com/product/12345")).toThrow("쿠팡 또는 쿠팡 파트너스 HTTPS 링크만 등록할 수 있습니다.");
  });

  it("resolves an official partner short link without calling the Coupang Partners API", async () => {
    const shortLink = "https://link.coupang.com/a/gi7pymQ87w";
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: "https://www.coupang.com/vp/products/9640170508?itemId=28803754031" },
    }));

    await expect(resolveCoupangLink(shortLink, fetcher)).resolves.toMatchObject({
      submittedUrl: shortLink,
      externalProductId: "9640170508:28803754031",
    });
    expect(fetcher).toHaveBeenCalledWith(shortLink, expect.objectContaining({ method: "HEAD", redirect: "manual" }));
  });

  it("keeps a direct product link local without a redirect request", async () => {
    const fetcher = vi.fn();
    await expect(resolveCoupangLink("https://www.coupang.com/vp/products/12345?itemId=123456&vendorItemId=987654", fetcher)).resolves.toMatchObject({ externalProductId: "12345:123456:987654" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
