import { describe, expect, it } from "vitest";
import { isAdminEmail } from "@shared/const";
import { selectCheapestPerProductGroup, selectCheapestPerProductGroupByRecency, selectRepresentativesPerFamily } from "./productDedupe";

const groupKey = (family: string, amount: number, unit: "ml" | "g" = "ml", quantity = 1) => `${family}|${unit}|${amount}|${quantity}`;

const product = (
  id: number,
  price: number,
  familyVariantKey: string | null,
  lastSeenAt: string,
  extra: { inStock?: boolean; refreshState?: string } = {},
) => ({
  id,
  familyVariantKey,
  currentPrice: price,
  lastSeenAt: new Date(lastSeenAt),
  ...extra,
});

describe("owner admin access", () => {
  it("allows only the exact configured owner email, case-insensitively", () => {
    expect(isAdminEmail("jc1725@gmail.com")).toBe(true);
    expect(isAdminEmail(" JC1725@GMAIL.COM ")).toBe(true);
    expect(isAdminEmail("other@example.com")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
});

// 2026-10-01: 추적 단위를 판매자별 SKU에서 제품(상품명 + 용량 + 수량)으로 올렸다.
// 같은 제품을 파는 판매자가 여러 곳이면 가장 싼 쪽 하나만 대표로 노출한다.
describe("selectCheapestPerProductGroup", () => {
  const family = "비플레인 시카풀 앰플";

  it("keeps only the cheapest seller for each product group", () => {
    const rows = [
      product(1, 52620, groupKey(family, 30), "2026-09-30T10:00:00Z"),
      product(2, 49140, groupKey(family, 30), "2026-09-30T09:00:00Z"),
      product(3, 13580, groupKey(family, 100), "2026-09-30T08:00:00Z"),
    ];

    expect(selectCheapestPerProductGroup(rows).map(row => row.id)).toEqual([2, 3]);
  });

  it("never merges different capacities, which the old unitLabel grouping did", () => {
    // 예전 묶음 기준(unitLabel)은 단가 환산 단위라 비뷰티 상품이면 30ml·100ml가 모두
    // "100ml"이었다. 그래서 용량이 다른 상품이 한 카드로 합쳐지고, 용량 작은 쪽이
    // 더 싸다는 이유로 대표가 됐다.
    const rows = [
      product(1, 15000, groupKey(family, 30), "2026-09-30T10:00:00Z"),
      product(2, 35000, groupKey(family, 100), "2026-09-30T09:00:00Z"),
    ];
    expect(selectCheapestPerProductGroup(rows).map(row => row.id)).toEqual([1, 2]);
  });

  it("never merges volume with weight even when the number matches", () => {
    const rows = [
      product(1, 15000, groupKey(family, 100, "ml"), "2026-09-30T10:00:00Z"),
      product(2, 9000, groupKey(family, 100, "g"), "2026-09-30T09:00:00Z"),
    ];
    expect(selectCheapestPerProductGroup(rows).map(row => row.id)).toEqual([1, 2]);
  });

  it("treats different pack quantities as different products", () => {
    const rows = [
      product(1, 65000, groupKey(family, 30, "ml", 5), "2026-09-30T10:00:00Z"),
      product(2, 77200, groupKey(family, 30, "ml", 6), "2026-09-30T09:00:00Z"),
    ];
    expect(selectCheapestPerProductGroup(rows).map(row => row.id)).toEqual([1, 2]);
  });

  it("keeps rows whose capacity could not be read as standalone products", () => {
    const rows = [
      product(1, 52000, "sku:7144144379:123:456", "2026-09-30T10:00:00Z"),
      product(2, 48000, "sku:7144144379:123:789", "2026-09-30T09:00:00Z"),
      product(3, 51000, null, "2026-09-30T08:00:00Z"),
    ];
    expect(selectCheapestPerProductGroup(rows).map(row => row.id)).toEqual([1, 2, 3]);
  });

  it("preserves the original order, placing each group's winner at its first position", () => {
    const rows = [
      product(10, 9900, groupKey("다른 상품", 50), "2026-09-30T10:00:00Z"),
      product(1, 65000, groupKey(family, 30), "2026-09-30T09:00:00Z"),
      product(2, 48000, groupKey(family, 30), "2026-09-30T08:00:00Z"),
    ];
    expect(selectCheapestPerProductGroup(rows).map(row => row.id)).toEqual([10, 2]);
  });

  it("never represents a group with a sold-out or zero-price row", () => {
    const rows = [
      product(1, 10000, groupKey(family, 30), "2026-09-30T10:00:00Z", { inStock: false }),
      product(2, 0, groupKey(family, 30), "2026-09-30T09:00:00Z"),
      product(3, 19000, groupKey(family, 30), "2026-09-30T08:00:00Z"),
    ];
    expect(selectCheapestPerProductGroup(rows).map(row => row.id)).toEqual([3]);
  });

  it("falls back to the cheapest row when every seller in the group is sold out", () => {
    const rows = [
      product(1, 19000, groupKey(family, 30), "2026-09-30T10:00:00Z", { inStock: false }),
      product(2, 17000, groupKey(family, 30), "2026-09-30T09:00:00Z", { inStock: false }),
    ];
    expect(selectCheapestPerProductGroup(rows).map(row => row.id)).toEqual([2]);
  });

  it("prefers a verified price over a cheaper one whose refresh is stuck", () => {
    // awaiting_collection은 쿠팡 검색에서 정확 SKU를 못 찾아 가격 갱신이 멈춘 상태라
    // 표시된 금액이 지금 값이라는 보장이 없다. 가격차 가드가 아니라 "확인되지 않은
    // 가격을 확인된 가격보다 앞세우지 않는다"는 규칙이다.
    const rows = [
      product(1, 12000, groupKey(family, 30), "2026-09-30T10:00:00Z", { refreshState: "awaiting_collection" }),
      product(2, 19000, groupKey(family, 30), "2026-09-30T09:00:00Z", { refreshState: "fresh" }),
    ];
    expect(selectCheapestPerProductGroup(rows).map(row => row.id)).toEqual([2]);
  });

  it("still uses the cheapest row when the whole group is stuck", () => {
    const rows = [
      product(1, 19000, groupKey(family, 30), "2026-09-30T10:00:00Z", { refreshState: "awaiting_collection" }),
      product(2, 12000, groupKey(family, 30), "2026-09-30T09:00:00Z", { refreshState: "awaiting_collection" }),
    ];
    expect(selectCheapestPerProductGroup(rows).map(row => row.id)).toEqual([2]);
  });
});

describe("selectCheapestPerProductGroupByRecency", () => {
  it("returns group winners ordered by the most recent observation", () => {
    const family = "헤드앤숄더 두피 토탈 솔루션";
    const rows = [
      product(1, 52620, groupKey(family, 500), "2026-09-30T08:00:00Z"),
      product(2, 49140, groupKey(family, 500), "2026-09-30T07:00:00Z"),
      product(3, 13580, groupKey(family, 100), "2026-09-30T11:00:00Z"),
    ];
    expect(selectCheapestPerProductGroupByRecency(rows).map(row => row.id)).toEqual([3, 2]);
  });
});

describe("selectRepresentativesPerFamily", () => {
  const familyRow = (id: number, price: number, lastSeenAt: string, familyKey = "헤드앤숄더 두피 토탈 솔루션") => ({
    id,
    familyKey,
    currentPrice: price,
    lastSeenAt: new Date(lastSeenAt),
  });

  it("keeps at most two lowest-price representatives per product family", () => {
    const rows = [
      familyRow(1, 90600, "2026-08-16T10:00:00Z"),
      familyRow(2, 12580, "2026-08-16T09:00:00Z"),
      familyRow(3, 22600, "2026-08-16T08:00:00Z"),
      familyRow(4, 40600, "2026-08-16T07:00:00Z"),
      familyRow(5, 9900, "2026-08-16T11:00:00Z", "다른 상품군"),
    ];

    expect(selectRepresentativesPerFamily(rows, 2).map(row => row.id).sort((a, b) => a - b)).toEqual([2, 3, 5]);
  });

  it("keeps rows with no family metadata instead of merging them", () => {
    const rows = [familyRow(1, 1000, "2026-08-16T10:00:00Z", ""), familyRow(2, 900, "2026-08-16T09:00:00Z", "")];
    expect(selectRepresentativesPerFamily(rows, 2).map(row => row.id).sort((a, b) => a - b)).toEqual([1, 2]);
  });
});
