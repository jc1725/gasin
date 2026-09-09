import { describe, expect, it } from "vitest";
import { buildAdminPriceHistoryCsv, type AdminPriceHistoryRow } from "./adminPriceExport";

const base: AdminPriceHistoryRow = {
  id: 1,
  externalProductId: "7144144379:1057466829:5531594514",
  name: "테스트, 상품",
  variantLabel: "80ml · 1개",
  unitLabel: "80ml",
  currentPrice: 8820,
  lowestPrice: 8520,
  source: "search",
  refreshState: "deferred",
  lastSeenAt: new Date("2026-08-16T11:05:00.000Z"),
  historyType: "official",
  price: 8820,
  recordedAt: new Date("2026-08-16T11:05:00.000Z"),
  note: null,
};

describe("buildAdminPriceHistoryCsv", () => {
  it("emits UTF-8 BOM, escaped Korean cells, and history labels", () => {
    const csv = buildAdminPriceHistoryCsv([base, { ...base, historyType: "admin_confirmed", price: 8540, note: "관리자, 직접 확인" }]);
    expect(csv.startsWith("\uFEFF상품ID,쿠팡SKU")).toBe(true);
    expect(csv).toContain('"테스트, 상품"');
    expect(csv).toContain("공식 가격");
    expect(csv).toContain("관리자 확인");
    expect(csv).toContain('"관리자, 직접 확인"');
  });
});
