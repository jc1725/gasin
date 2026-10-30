import { describe, expect, it } from "vitest";
import { selectCheapestPerProductGroup } from "./productDedupe";

// 2026-10-30: 용량이 없는 세트 상품(프리메라 오가니언스 2종 세트 · 1세트 · 36,650원 등)이
// 판매자별 SKU 키로 남아 같은 제품·같은 가격 카드가 두 장씩 노출되던 문제.
type Row = { id: number; name: string; familyVariantKey: string | null; variantLabel: string | null; quantity: number | null; currentPrice: number; inStock?: boolean };
const row = (id: number, name: string, currentPrice: number, extra: Partial<Row> = {}): Row => ({
  id,
  name,
  familyVariantKey: `sku:9:${id}:${id}`,
  variantLabel: "1세트",
  quantity: 1,
  currentPrice,
  ...extra,
});

describe("용량 없는 세트 상품 중복 정리", () => {
  it("상품명·옵션·수량이 같으면 한 장만 남기고, 자리는 처음 나온 곳을 유지한다", () => {
    const rows = [
      row(1, "프리메라 맨 오가니언스 2종 세트", 33_660),
      row(2, "프리메라 맨 오가니언스 2종 세트", 33_660),
      row(3, "프리메라 오가니언스 2종 세트", 36_650),
      row(4, "프리메라 오가니언스 베리어 리페어 2종 세트", 50_280),
      row(5, "프리메라 오가니언스 2종 세트", 36_650),
    ];
    expect(selectCheapestPerProductGroup(rows).map(item => item.id)).toEqual([1, 3, 4]);
  });

  it("가격이 다르면 더 싼 쪽을 대표로 쓴다(용량이 있는 상품과 같은 규칙)", () => {
    const result = selectCheapestPerProductGroup([row(1, "프리메라 오가니언스 2종 세트", 38_000), row(2, "프리메라 오가니언스 2종 세트", 36_650)]);
    expect(result.map(item => item.id)).toEqual([2]);
  });

  it("띄어쓰기·기호·대소문자 차이는 같은 이름으로 본다", () => {
    const result = selectCheapestPerProductGroup([row(1, "프리메라 오가니언스 2종 세트", 36_650), row(2, "프리메라  오가니언스 2종-세트", 36_650)]);
    expect(result).toHaveLength(1);
  });

  it("옵션 라벨이 다르거나 수량이 다르면 합치지 않는다", () => {
    const rows = [
      row(1, "프리메라 오가니언스 2종 세트", 36_650),
      row(2, "프리메라 오가니언스 2종 세트", 70_000, { variantLabel: "2세트", quantity: 2 }),
      row(3, "프리메라 오가니언스 2종 세트", 36_650, { quantity: 2 }),
    ];
    expect(selectCheapestPerProductGroup(rows)).toHaveLength(3);
  });

  it("옵션 라벨이 없는 행은 어떤 구성인지 모르므로 합치지 않는다", () => {
    const rows = [row(1, "프리메라 오가니언스 2종 세트", 36_650, { variantLabel: null }), row(2, "프리메라 오가니언스 2종 세트", 36_650, { variantLabel: null })];
    expect(selectCheapestPerProductGroup(rows)).toHaveLength(2);
  });

  it("이름이 다른 세트는 합치지 않는다(에멀전+워터 구성 등)", () => {
    const rows = [row(1, "프리메라 오가니언스 2종 세트", 36_650), row(2, "프리메라 오가니언스 2종 세트 에멀전+워터", 36_650)];
    expect(selectCheapestPerProductGroup(rows)).toHaveLength(2);
  });

  it("품절 행보다 구매 가능한 행을 대표로 남긴다", () => {
    const result = selectCheapestPerProductGroup([row(1, "프리메라 오가니언스 2종 세트", 30_000, { inStock: false }), row(2, "프리메라 오가니언스 2종 세트", 36_650)]);
    expect(result.map(item => item.id)).toEqual([2]);
  });
});
