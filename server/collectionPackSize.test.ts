import { describe, expect, it } from "vitest";
import { extractPackSizeFromOptionName } from "./db";
import { describeProductVariant, getProductFamilyKey } from "./productVariant";

describe("수집기 복합 옵션의 포장 단위", () => {
  it("개입 포장 단위를 실제 구매 수량과 분리해 추출한다", () => {
    expect(extractPackSizeFromOptionName("30개입, 2개")).toBe("30개입");
    expect(extractPackSizeFromOptionName("마스크팩 10매입 / 3개")).toBe("10매입");
  });

  it("개입 포장 단위가 상품군 키에 남거나 실제 수량으로 잘못 계산되지 않는다", () => {
    expect(getProductFamilyKey("메디힐 마스크팩 30개입, 2개")).not.toContain("입");
    expect(describeProductVariant("메디힐 마스크팩 30개입, 2개", 10000).variantLabel).toBeNull();
  });
});
