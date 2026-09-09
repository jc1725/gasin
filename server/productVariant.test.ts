import { describe, expect, it } from "vitest";
import { describeProductVariant } from "./productVariant";

describe("describeProductVariant", () => {
  it("keeps a beauty product's capacity and quantity separate and calculates price per 10ml", () => {
    expect(describeProductVariant("비플레인 녹두 약산성 클렌징폼, 80ml, 1개", 8820, "뷰티")).toEqual({
      variantLabel: "80ml × 1개",
      unitPrice: 1103,
      unitLabel: "10ml",
    });
  });

  it("converts L and multiplacks to a price per 100ml", () => {
    expect(describeProductVariant("탄산수, 1.5L, 12개", 18000, "식품")).toEqual({
      variantLabel: "1.5L × 12개",
      unitPrice: 100,
      unitLabel: "100ml",
    });
  });

  it("calculates a solid multipack price per 100g", () => {
    expect(describeProductVariant("견과류, 500g, 4개", 12000, "식품")).toEqual({
      variantLabel: "500g × 4개",
      unitPrice: 600,
      unitLabel: "100g",
    });
  });

  it("does not invent capacity or unit pricing when the Coupang response has no option metadata", () => {
    expect(describeProductVariant("비플레인 녹두 약산성 클렌징폼", 6000, "뷰티")).toEqual({
      variantLabel: null,
      unitPrice: null,
      unitLabel: null,
    });
  });
});
