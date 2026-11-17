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

  it("조건부 경로(extraPaths)는 전달된 경우에만 정적 사이트맵에 들어간다", () => {
    const now = new Date("2026-09-04T00:00:00Z");
    expect(buildStaticSitemapXml(now)).not.toContain("/deals/drops");
    const xml = buildStaticSitemapXml(now, ["/deals/drops"]);
    expect(xml).toContain("https://gasin.shop/deals/drops");
    expect(xml).not.toContain("/deals/low");
  });
});
