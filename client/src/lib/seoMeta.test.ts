import { describe, expect, it } from "vitest";
import { getProductPageMeta } from "./seoMeta";

describe("product SEO metadata", () => {
  it("includes product name, current price, 90-day low and Product Offer schema", () => {
    const meta = getProductPageMeta({ id: 2460009, name: "세타필 모이스춰라이징 로션", currentPrice: 13600, lowestPrice: 14000, inStock: true, imageUrl: "https://image.example.test/a.jpg" }, [
      { price: 15000, recordedAt: "2026-09-01" },
      { price: 13600, recordedAt: "2026-09-04" },
    ]);
    expect(meta.title).toContain("세타필 모이스춰라이징 로션");
    expect(meta.title).toContain("최저 13,600원");
    expect(meta.description).toContain("현재 가격은 13,600원");
    expect(meta.structuredData?.[0]).toMatchObject({ "@type": "Product", name: "세타필 모이스춰라이징 로션" });
    expect((meta.structuredData?.[0] as { offers: { price: string; priceCurrency: string } }).offers).toMatchObject({ price: "13600", priceCurrency: "KRW" });
  });
});
