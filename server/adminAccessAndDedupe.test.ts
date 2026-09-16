import { describe, expect, it } from "vitest";
import { isAdminEmail } from "@shared/const";
import { selectCheapestPerFamilyByItemPrice, selectCheapestPerFamilyUnit, selectRepresentativesPerFamily } from "./productDedupe";

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

// 2026-09-16: 같은 제품이 용량은 같고 수량(묶음 개수)만 달라 검색 결과 카드가
// 여러 개로 흩어져 보이던 문제(비플레인 시카풀 앰플 사례)를 막는 함수.
describe("selectCheapestPerFamilyByItemPrice", () => {
  const withQuantity = (id: number, price: number, quantity: number | null, unitLabel: string | null = "10ml", familyKey = "비플레인 시카풀 앰플") => ({
    id,
    familyKey,
    unitLabel,
    currentPrice: price,
    quantity,
  });

  it("keeps only the cheapest per-single-item price within a product family and unit", () => {
    const rows = [
      withQuantity(1, 52000, null, null), // 옵션 미확인 - 용량·수량 모두 모름
      withQuantity(2, 65000, 5), // 30ml, 1개당 13,000원
      withQuantity(3, 77200, 6), // 30ml, 1개당 12,866.67원 - 가장 저렴
    ];

    const result = selectCheapestPerFamilyByItemPrice(rows);
    // 옵션 미확인(id 1)은 용량을 알 수 없어 30ml 그룹과 합치지 않고 그대로 남고,
    // 30ml 그룹(id 2, 3)은 1개당 가격이 더 싼 id 3만 남는다.
    expect(result.map(row => row.id).sort((a, b) => a - b)).toEqual([1, 3]);
  });

  it("does not merge items with different confirmed capacities even in the same family", () => {
    const rows = [
      withQuantity(1, 15000, null, "10ml"), // 30ml 1개
      withQuantity(2, 35000, null, "100g"), // 100g 1개 - 용량 단위 자체가 다른 상품
    ];
    expect(selectCheapestPerFamilyByItemPrice(rows).map(row => row.id).sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it("preserves the original array order, placing each group's winner at its first position", () => {
    const rows = [
      withQuantity(10, 9900, 3, "1개", "다른 상품"),
      withQuantity(1, 65000, 5),
      withQuantity(2, 77200, 6),
    ];

    const result = selectCheapestPerFamilyByItemPrice(rows);
    // "다른 상품"은 그대로 첫 자리를 지키고, 같은 상품군·용량(id 1, 2)의 대표는
    // 그 그룹이 배열에서 처음 등장한 두 번째 자리에 남는다.
    expect(result.map(row => row.id)).toEqual([10, 2]);
  });

  it("falls back to the lowest raw price when no item in the group has a known quantity", () => {
    const rows = [withQuantity(1, 52000, null), withQuantity(2, 48000, null)];
    expect(selectCheapestPerFamilyByItemPrice(rows).map(row => row.id)).toEqual([2]);
  });

  it("does not merge rows with no family metadata", () => {
    const rows = [withQuantity(1, 1000, 1, "10ml", null as unknown as string), withQuantity(2, 900, 1, "10ml", null as unknown as string)];
    expect(selectCheapestPerFamilyByItemPrice(rows).map(row => row.id).sort((a, b) => a - b)).toEqual([1, 2]);
  });
});
