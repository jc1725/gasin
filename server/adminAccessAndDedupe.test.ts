import { describe, expect, it } from "vitest";
import { isAdminEmail } from "@shared/const";
import { selectCheapestPerFamilyUnit, selectRepresentativesPerFamily } from "./productDedupe";

const product = (id: number, price: number, unitLabel: string | null, lastSeenAt: string, familyKey = "헤드앤숄더 두피 토탈 솔루션") => ({
  id,
  familyKey,
  unitLabel,
  currentPrice: price,
  lastSeenAt: new Date(lastSeenAt),
});

describe("owner admin access", () => {
  it("allows only the exact configured owner email, case-insensitively", () => {
    expect(isAdminEmail("jc1725@gmail.com")).toBe(true);
    expect(isAdminEmail(" JC1725@GMAIL.COM ")).toBe(true);
    expect(isAdminEmail("other@example.com")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
});

describe("selectCheapestPerFamilyUnit", () => {
  it("keeps only the cheapest product for each family and normalized unit", () => {
    const rows = [
      product(1, 52620, "10ml", "2026-08-16T10:00:00Z"),
      product(2, 49140, " 10ML ", "2026-08-16T09:00:00Z"),
      product(3, 13580, "100ml", "2026-08-16T08:00:00Z"),
      product(4, 87700, "100ml", "2026-08-16T11:00:00Z"),
    ];

    expect(selectCheapestPerFamilyUnit(rows).map(row => row.id).sort((a, b) => a - b)).toEqual([2, 3]);
  });

  it("does not merge rows when capacity metadata is missing", () => {
    const rows = [product(1, 1000, null, "2026-08-16T10:00:00Z"), product(2, 900, null, "2026-08-16T09:00:00Z")];
    expect(selectCheapestPerFamilyUnit(rows).map(row => row.id).sort((a, b) => a - b)).toEqual([1, 2]);
  });
});

describe("selectRepresentativesPerFamily", () => {
  it("keeps at most two lowest-price representatives per product family", () => {
    const rows = [
      product(1, 90600, "500ml", "2026-08-16T10:00:00Z"),
      product(2, 12580, "100ml", "2026-08-16T09:00:00Z"),
      product(3, 22600, "300ml", "2026-08-16T08:00:00Z"),
      product(4, 40600, "700ml", "2026-08-16T07:00:00Z"),
      product(5, 9900, "1개", "2026-08-16T11:00:00Z", "다른 상품군"),
    ];

    expect(selectRepresentativesPerFamily(rows, 2).map(row => row.id).sort((a, b) => a - b)).toEqual([2, 3, 5]);
  });

  it("keeps rows with no family metadata instead of merging them", () => {
    const rows = [product(1, 1000, "100ml", "2026-08-16T10:00:00Z", ""), product(2, 900, "200ml", "2026-08-16T09:00:00Z", "")];
    expect(selectRepresentativesPerFamily(rows, 2).map(row => row.id).sort((a, b) => a - b)).toEqual([1, 2]);
  });
});
