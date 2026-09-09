import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildMethodologyFaqSchema, methodologyFaqs, methodologyWebPageSchema } from "@/lib/methodologyContent";

const page = fs.readFileSync(path.join(process.cwd(), "client/src/pages/Methodology.tsx"), "utf8");

describe("가격 검증 방법론 콘텐츠", () => {
  it("화면에 보이는 질문·답변과 동일한 FAQPage 구조화 데이터를 제공한다", () => {
    const schema = buildMethodologyFaqSchema();
    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.mainEntity.map(item => item.name)).toEqual(methodologyFaqs.map(item => item.question));
    expect(schema.mainEntity.map(item => item.acceptedAnswer.text)).toEqual(methodologyFaqs.map(item => item.answer));
    expect(schema.mainEntity.every(item => item.acceptedAnswer.text.split(".").length >= 4)).toBe(true);
  });

  it("정확 옵션·와우회원가 관측·90일 이력·재확인 원칙을 공개하고 가격 추적 CTA를 제공한다", () => {
    expect(methodologyWebPageSchema.url).toBe("https://gasin.shop/methodology");
    expect(page).toContain("가신의 가격 검증 방법");
    expect(page).toContain("methodologyFaqs.map");
    expect(page).toContain("가신으로 이 상품 가격 추적하기");
    expect(methodologyFaqs.flatMap(item => item.answer).join(" ")).toContain("최근 24시간");
    expect(methodologyFaqs.flatMap(item => item.answer).join(" ")).toContain("최근 7일");
    expect(methodologyFaqs.flatMap(item => item.answer).join(" ")).toContain("90일 최저가");
  });
});
