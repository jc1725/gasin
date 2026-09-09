import { describe, expect, it } from "vitest";
import { buildGuideFaqSchema, guideFaqs } from "@/lib/guideContent";

describe("GEO 가이드 콘텐츠", () => {
  it("표시 질문과 FAQPage 구조화 데이터의 질문·답변을 동일하게 제공한다", () => {
    const schema = buildGuideFaqSchema();
    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.mainEntity).toHaveLength(5);
    expect(schema.mainEntity.map(item => item.name)).toEqual(guideFaqs.map(item => item.question));
    expect(schema.mainEntity.map(item => item.name)).toContain("쿠팡 가격, 왜 항상 똑같이 저렴해 보이지 않을까?");
    expect(schema.mainEntity.every(item => item.acceptedAnswer.text.split(".").length >= 3)).toBe(true);
  });
});
