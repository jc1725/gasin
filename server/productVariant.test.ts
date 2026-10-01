import { describe, expect, it } from "vitest";
import { buildProductGroupKey, describeProductVariant, getProductFamilyKey, getProductGroupKey, isUngroupedProductKey, PRODUCT_GROUP_KEY_MAX_LENGTH, resolveStoredProductGroupKey } from "./productVariant";

describe("describeProductVariant", () => {
  it("keeps a beauty product's capacity and quantity separate and calculates price per 10ml", () => {
    expect(describeProductVariant("비플레인 녹두 약산성 클렌징폼, 80ml, 1개", 8820, "뷰티")).toEqual({
      variantLabel: "80ml × 1개",
      unitPrice: 1103,
      unitLabel: "10ml",
      quantity: 1,
      sizeAmount: 80,
      measureUnit: "ml",
    });
  });

  it("converts L and multiplacks to a price per 100ml", () => {
    expect(describeProductVariant("탄산수, 1.5L, 12개", 18000, "식품")).toEqual({
      variantLabel: "1.5L × 12개",
      unitPrice: 100,
      unitLabel: "100ml",
      quantity: 12,
      sizeAmount: 1500,
      measureUnit: "ml",
    });
  });

  it("calculates a solid multipack price per 100g", () => {
    expect(describeProductVariant("견과류, 500g, 4개", 12000, "식품")).toEqual({
      variantLabel: "500g × 4개",
      unitPrice: 600,
      unitLabel: "100g",
      quantity: 4,
      sizeAmount: 500,
      measureUnit: "g",
    });
  });

  it("does not invent capacity or unit pricing when the Coupang response has no option metadata", () => {
    expect(describeProductVariant("비플레인 녹두 약산성 클렌징폼", 6000, "뷰티")).toEqual({
      variantLabel: null,
      unitPrice: null,
      unitLabel: null,
      quantity: null,
      sizeAmount: null,
      measureUnit: null,
    });
  });

  it("keeps a bare quantity marker even without a capacity token", () => {
    expect(describeProductVariant("퀸센스 인덕션 로제 냄비 2개", 45000, "생활용품")).toEqual({
      variantLabel: "2개",
      unitPrice: null,
      unitLabel: null,
      quantity: 2,
      sizeAmount: null,
      measureUnit: null,
    });
  });

  it("returns nothing when the name has neither a capacity nor a quantity token", () => {
    expect(describeProductVariant("삼다수 무라벨 그린", 4500, "식품")).toEqual({
      variantLabel: null,
      unitPrice: null,
      unitLabel: null,
      quantity: null,
      sizeAmount: null,
      measureUnit: null,
    });
  });
});

// 2026-10-01: 추적 단위를 제품(상품명 + 용량 + 수량)으로 올리면서 추가한 그룹키.
describe("getProductGroupKey", () => {
  it("gives the same key to the same capacity written differently", () => {
    expect(getProductGroupKey("곰곰 아몬드 1kg", null)).toBe(getProductGroupKey("곰곰 아몬드 1000g", null));
    expect(getProductGroupKey("삼다수 생수 1L", null)).toBe(getProductGroupKey("삼다수 생수 1000ml", null));
  });

  it("separates different capacities, which the old unitLabel grouping could not", () => {
    expect(getProductGroupKey("비플레인 토너 30ml", null)).not.toBe(getProductGroupKey("비플레인 토너 100ml", null));
  });

  it("never mixes volume with weight", () => {
    expect(getProductGroupKey("어떤 제품 100ml", null)).not.toBe(getProductGroupKey("어떤 제품 100g", null));
  });

  it("separates pack quantities", () => {
    expect(getProductGroupKey("비플레인 앰플 30ml 5개", null)).not.toBe(getProductGroupKey("비플레인 앰플 30ml 6개", null));
  });

  it("returns null when the capacity cannot be read, so unrelated products are never merged", () => {
    expect(getProductGroupKey("야마하 소프라노 리코더 저먼식 YRS-23G", null)).toBeNull();
    expect(getProductGroupKey("오투 중학 과학 2022개정 교육과정", null)).toBeNull();
  });
});

describe("resolveStoredProductGroupKey", () => {
  it("reads the capacity from the stored option label rather than the product name", () => {
    // 관리자 수정·수집기 관측으로 저장된 옵션이 상품명보다 정확해서 그 값을 쓴다.
    const key = resolveStoredProductGroupKey({ familyKey: "비플레인 앰플", variantLabel: "30ml × 2개", quantity: 2 });
    expect(key).toBe("비플레인 앰플|ml|30|2");
  });

  it("falls back to a SKU-scoped key so an ungroupable row never merges with another", () => {
    const first = resolveStoredProductGroupKey({ familyKey: "리코더", variantLabel: null, quantity: null, externalProductId: "1:2:3" });
    const second = resolveStoredProductGroupKey({ familyKey: "리코더", variantLabel: null, quantity: null, externalProductId: "1:2:4" });
    expect(first).toBe("sku:1:2:3");
    expect(isUngroupedProductKey(first)).toBe(true);
    expect(first).not.toBe(second);
  });

  it("keeps the capacity suffix intact when the product name is very long", () => {
    const key = resolveStoredProductGroupKey({ familyKey: "가".repeat(600), variantLabel: "500ml", quantity: null });
    expect(key).not.toBeNull();
    expect(key!.length).toBeLessThanOrEqual(PRODUCT_GROUP_KEY_MAX_LENGTH);
    expect(key!.endsWith("|ml|500|1")).toBe(true);
  });
});

// 2026-10-01: "비플레인 녹두 약산성 클렌징폼 120ml + 80ml 기획세트"가 상세 화면에
// 용량 80ml로 표기되고 있었다. 용량 표기를 여러 개 찾은 뒤 마지막 하나만 쓰고 있어서
// 앞쪽 120ml이 통째로 사라졌고, 단가도 200ml이 아니라 80ml 기준으로 계산됐다
// (77,200원이 "10ml당 9,650원"). 그룹키까지 80ml 낱개 상품과 같은 묶음으로 잡혔다.
describe("'+'로 이어진 기획 구성의 용량", () => {
  it("곧바로 이어진 용량 표기를 합산한다", () => {
    const variant = describeProductVariant("비플레인 녹두 약산성 클렌징폼 120ml + 80ml 기획세트", 19_300, "뷰티");
    expect(variant.variantLabel).toBe("200ml");
    expect(variant.sizeAmount).toBe(200);
    expect(variant.measureUnit).toBe("ml");
    // 80ml 기준이면 2,413원이 되어 실제보다 2.5배 비싸 보인다.
    expect(variant.unitPrice).toBe(965);
  });

  it("단위가 달라도 환산해서 합산하고 표시 단위는 환산 단위를 쓴다", () => {
    const variant = describeProductVariant("생수 1L + 500ml 기획", 2_000);
    expect(variant.variantLabel).toBe("1500ml");
    expect(variant.sizeAmount).toBe(1_500);
  });

  it("부피와 무게가 섞여 있으면 합산하지 않는다", () => {
    const variant = describeProductVariant("음료 500ml + 과자 100g", 5_000);
    expect(variant.measureUnit).toBe("g");
    expect(variant.sizeAmount).toBe(100);
  });

  it("용량 사이에 다른 품목명이 끼어 있으면 합산하지 않는다", () => {
    // 서로 다른 품목일 수 있어, 합치는 쪽이 틀렸을 때의 피해가 더 크다.
    const variant = describeProductVariant("샴푸 500ml + 트리트먼트 300ml 세트", 20_000, "뷰티");
    expect(variant.sizeAmount).toBe(300);
  });

  it("합산해도 모델명 오인식 방어는 그대로다", () => {
    expect(describeProductVariant("야마하 소프라노 리코더 저먼식 YRS-23G", 12_000).sizeAmount).toBeNull();
    expect(describeProductVariant("오투 중학 과학 2022개정 교육과정", 15_000).sizeAmount).toBeNull();
  });

  it("합산된 용량이 그룹키에 반영된다", () => {
    const name = "비플레인 녹두 약산성 클렌징폼 120ml + 80ml 기획세트";
    const variant = describeProductVariant(name, 19_300, "뷰티");
    const key = buildProductGroupKey(getProductFamilyKey(name), variant);
    expect(key).toContain("|ml|200|1");
    // 80ml 낱개 상품과 같은 그룹으로 묶이면 안 된다.
    const single = "비플레인 녹두 약산성 클렌징폼 80ml";
    expect(key).not.toBe(buildProductGroupKey(getProductFamilyKey(single), describeProductVariant(single, 8_330, "뷰티")));
  });
});
