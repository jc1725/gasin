import { describe, expect, it } from "vitest";
import { dedupeVariantsWithoutOptionInfo } from "./productVariantDedupe";

const variant = (id: number, price: number, variantLabel: string | null) => ({ id, currentPrice: price, variantLabel });

describe("dedupeVariantsWithoutOptionInfo", () => {
  it("옵션 정보가 없는 행이 같은 가격의 확인된 행과 겹치면 숨긴다 (비플레인 녹두 클렌징폼 사례)", () => {
    const variants = [
      variant(1, 8300, "80ml × 1개"), // 현재 보고 있는 구성
      variant(2, 8300, null), // 용량·수량 정보 미제공 - 같은 가격이라 중복으로 판단
    ];
    expect(dedupeVariantsWithoutOptionInfo(variants, 1).map(v => v.id)).toEqual([1]);
  });

  it("가격이 다르면 옵션 정보가 없어도 숨기지 않는다", () => {
    const variants = [variant(1, 8300, "80ml × 1개"), variant(2, 7760, null)];
    expect(dedupeVariantsWithoutOptionInfo(variants, 1).map(v => v.id)).toEqual([1, 2]);
  });

  it("옵션 정보가 없는 행끼리는 비교 기준이 없으므로 합치지 않는다", () => {
    const variants = [variant(1, 8300, "80ml × 1개"), variant(2, 9900, null), variant(3, 9900, null)];
    expect(dedupeVariantsWithoutOptionInfo(variants, 1).map(v => v.id)).toEqual([1, 2, 3]);
  });

  it("현재 보고 있는 상품은 옵션 정보가 없어도 항상 남긴다(keepId 보호가 없다면 중복으로 숨겨졌을 것)", () => {
    const variants = [variant(1, 8300, null), variant(2, 8300, "80ml × 1개")];
    expect(dedupeVariantsWithoutOptionInfo(variants, 1).map(v => v.id)).toEqual([1, 2]);
  });

  it("모두 옵션 정보가 있으면 그대로 둔다", () => {
    const variants = [variant(1, 8300, "80ml × 1개"), variant(2, 16600, "80ml × 2개")];
    expect(dedupeVariantsWithoutOptionInfo(variants, 1).map(v => v.id)).toEqual([1, 2]);
  });
});
