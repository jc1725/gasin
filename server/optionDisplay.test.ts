import { describe, expect, it } from "vitest";
import { getOptionDisplay } from "../client/src/lib/optionDisplay";

describe("getOptionDisplay", () => {
  it("renders explicit fallback text when API option metadata is null", () => {
    expect(getOptionDisplay({ variantLabel: null, unitPrice: null, unitLabel: null })).toEqual({
      label: "용량·수량 정보 미제공",
      showProductName: true,
      unitText: "단위가 정보 미제공",
    });
  });
});
