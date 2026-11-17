import { describe, expect, it } from "vitest";
import { buildDealsItemListSchema, getPageMeta, getStructuredDataForPath } from "./seoMeta";

describe("/deals SEO", () => {
  it("두 목록 페이지에 서로 다른 title·description이 있고 '최저가' 문구를 쓰지 않는다", () => {
    const drops = getPageMeta("/deals/drops");
    const low = getPageMeta("/deals/low");
    expect(drops.title).not.toBe(low.title);
    for (const meta of [drops, low]) {
      expect(meta.title).toContain("가신");
      expect(`${meta.title}${meta.description}${meta.socialTitle}${meta.socialDescription}`).not.toContain("최저가");
    }
  });

  it("ItemList JSON-LD는 화면에 표시하는 상품 URL만 순서대로 담는다", () => {
    const schema = buildDealsItemListSchema([{ id: 7, name: "생수 500ml" }, { id: 9, name: "휴지" }]) as { numberOfItems: number; itemListElement: Array<{ position: number; url: string }> };
    expect(schema.numberOfItems).toBe(2);
    expect(schema.itemListElement.map(entry => entry.url)).toEqual(["https://gasin.shop/product/7", "https://gasin.shop/product/9"]);
    expect(schema.itemListElement.map(entry => entry.position)).toEqual([1, 2]);
  });

  it("목록 페이지 구조화 데이터에 BreadcrumbList와 ItemList가 함께 들어간다", () => {
    const list = buildDealsItemListSchema([{ id: 1, name: "상품" }]);
    const types = getStructuredDataForPath("/deals/low", [list]).map(item => (item as { "@type": string })["@type"]);
    expect(types).toContain("BreadcrumbList");
    expect(types).toContain("ItemList");
  });
});
