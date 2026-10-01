import { describe, expect, it } from "vitest";
import { selectRelatedVariantsForDisplay } from "./productDedupe";

type Row = {
  id: number;
  familyKey: string | null;
  familyVariantKey: string | null;
  variantLabel: string | null;
  quantity: number | null;
  externalProductId: string;
  currentPrice: number;
  inStock?: boolean;
  refreshState?: string | null;
};

const FAMILY = "비플레인 녹두 약산성 클렌징폼";
const row = (id: number, variantLabel: string | null, currentPrice: number, extra: Partial<Row> = {}): Row => ({
  id,
  familyKey: FAMILY,
  familyVariantKey: null,
  variantLabel,
  quantity: null,
  externalProductId: `9:${id}:${id}`,
  currentPrice,
  ...extra,
});

// 2026-10-01: "다른 옵션 보기"가 같은 구성(80ml·1개)의 다른 판매자 행과 옵션 정보 없는 행으로
// 58개까지 길어지던 문제(스크린샷: 80ml, 1개 / 80ml × 1개 / 용량·수량 정보 미제공 …).
describe("다른 옵션 보기 — 구성 하나당 한 줄", () => {
  const current = row(1, "80ml, 1개", 8890);

  it("지금 보고 있는 상품과 같은 구성의 다른 판매자 행은 뺀다(상단 '더 싼 판매처' 배너가 담당)", () => {
    const result = selectRelatedVariantsForDisplay(current, [row(2, "80ml × 1개", 8330), row(3, "200ml", 15000)]);
    expect(result.map(item => item.id)).toEqual([3]);
  });

  it("다른 구성은 구성마다 최저가 한 행만 남기고 입력 순서를 유지한다", () => {
    const result = selectRelatedVariantsForDisplay(current, [
      row(4, "200ml", 15000),
      row(5, "200ml, 1개", 14000),
      row(6, "80ml × 2개", 16000, { quantity: 2 }),
      row(7, "80ml, 2개", 17000, { quantity: 2 }),
    ]);
    expect(result.map(item => item.id)).toEqual([5, 6]);
  });

  it("품절 행보다 구매 가능한 행을 대표로 쓴다", () => {
    const result = selectRelatedVariantsForDisplay(current, [row(8, "200ml", 9000, { inStock: false }), row(9, "200ml", 12000)]);
    expect(result.map(item => item.id)).toEqual([9]);
  });

  it("옵션 정보가 있는 행이 하나라도 있으면 '용량·수량 정보 미제공' 행은 숨긴다", () => {
    const result = selectRelatedVariantsForDisplay(current, [row(10, null, 11000), row(11, "200ml", 15000), row(12, null, 9000)]);
    expect(result.map(item => item.id)).toEqual([11]);
  });

  it("옵션 정보가 있는 행이 하나도 없으면 정보 없는 행이라도 보여 준다", () => {
    const result = selectRelatedVariantsForDisplay(current, [row(13, null, 11000), row(14, null, 9000)]);
    expect(result.map(item => item.id)).toEqual([13, 14]);
  });

  it("저장된 그룹키(familyVariantKey)가 있으면 그것을 쓴다", () => {
    const result = selectRelatedVariantsForDisplay(
      { ...current, familyVariantKey: "k|80" },
      [row(15, "80ml", 8000, { familyVariantKey: "k|80" }), row(16, "80ml", 8100, { familyVariantKey: "k|other" })],
    );
    expect(result.map(item => item.id)).toEqual([16]);
  });
});
