import { describe, expect, it } from "vitest";
import { buildSitemapIndexXml, buildStaticSitemapXml } from "./seoSitemap";

describe("SEO sitemap XML", () => {
  it("uses a sitemap index with static and product shards", () => {
    const xml = buildSitemapIndexXml(new Date("2026-09-04T00:00:00Z"));
    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain("https://gasin.shop/sitemap-static.xml");
    expect(xml).toContain("https://gasin.shop/sitemap-products-1.xml");
    expect(xml).not.toContain("<priority>");
  });

  it("emits static URLs with lastmod", () => {
    const xml = buildStaticSitemapXml(new Date("2026-09-04T00:00:00Z"));
    expect(xml).toContain("https://gasin.shop/guide");
    expect(xml).toContain("<lastmod>2026-09-04</lastmod>");
  });
});
