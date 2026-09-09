import { describe, expect, it } from "vitest";
import { getSafeMergeDirection, listSafeMergeCandidates } from "./productMerge";

const legacy = { id: 1, externalProductId: "33414098", name: "매일우유 무지방 0%, 200ml, 120개", variantLabel: "200ml × 120개", currentPrice: 62510 };
const exact = { id: 2, externalProductId: "33414098:8483121623:94983884904", name: "매일우유 무지방 0%, 200ml, 120개", variantLabel: "200ml × 120개", currentPrice: 62510 };

describe("safe product merge candidates", () => {
  it("uses the page-only row as source and the exact option SKU as target", () => {
    expect(getSafeMergeDirection(legacy, exact)).toEqual({ source: legacy, target: exact });
  });

  it("does not merge different prices, variants, or two exact vendor option SKUs", () => {
    expect(getSafeMergeDirection(legacy, { ...exact, currentPrice: 62511 })).toBeNull();
    expect(getSafeMergeDirection(legacy, { ...exact, variantLabel: "200ml × 24개" })).toBeNull();
    expect(getSafeMergeDirection(exact, { ...exact, id: 3, externalProductId: "33414098:8483121623:94983884905" })).toBeNull();
  });

  it("lists only safe legacy-to-exact candidate pairs", () => {
    expect(listSafeMergeCandidates([legacy, exact, { ...exact, id: 3, externalProductId: "33414098:8483121623:94983884905" }])).toEqual([{ source: legacy, target: exact }, { source: legacy, target: { ...exact, id: 3, externalProductId: "33414098:8483121623:94983884905" } }]);
  });

  it("does not suggest a merge when quantity or pack size differs", () => {
    expect(getSafeMergeDirection({ ...legacy, quantity: 1 }, { ...exact, quantity: 2 })).toBeNull();
    expect(getSafeMergeDirection({ ...legacy, packSize: "1팩" }, { ...exact, packSize: "2팩" })).toBeNull();
  });
});
