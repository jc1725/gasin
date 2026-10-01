import { describe, expect, it } from "vitest";
import { describeProductVariant, getProductGroupKey, isUngroupedProductKey, PRODUCT_GROUP_KEY_MAX_LENGTH, resolveStoredProductGroupKey } from "./productVariant";

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
