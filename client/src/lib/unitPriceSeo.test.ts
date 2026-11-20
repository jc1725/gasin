import { describe, expect, it } from "vitest";
import { getPageMeta, getStructuredDataForPath, buildDealsItemListSchema } from "./seoMeta";

describe("/unit-price SEO", () => {
  it("전용 title·description이 있고 '최저가' 문구를 쓰지 않는다", () => {
    const meta = getPageMeta("/unit-price");
    expect(meta.title).toContain("단가");
    expect(meta.title).toContain("가신");
    expect(`${meta.title}${meta.description}${meta.socialTitle}${meta.socialDescription}`).not.toContain("최저가");
  });

  it("BreadcrumbList와 ItemList 구조화 데이터가 들어간다", () => {
    const types = getStructuredDataForPath("/unit-price", [buildDealsItemListSchema([{ id: 1, name: "세제 1kg" }])]).map(item => (item as { "@type": string })["@type"]);
    expect(types).toContain("BreadcrumbList");
    expect(types).toContain("ItemList");
  });
});
