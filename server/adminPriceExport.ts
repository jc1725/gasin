export type AdminPriceHistoryRow = {
  id: number;
  externalProductId: string;
  name: string;
  variantLabel: string | null;
  unitLabel: string | null;
  currentPrice: number;
  lowestPrice: number;
  source: string;
  refreshState: string;
  lastSeenAt: Date;
  historyType: "official" | "admin_confirmed";
  price: number;
  recordedAt: Date;
  note: string | null;
};

const headers = ["상품ID", "쿠팡SKU", "상품명", "옵션", "용량", "현재가", "90일 최저가", "상품출처", "갱신상태", "이력구분", "가격", "기록일시", "메모"];

function escapeCell(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildAdminPriceHistoryCsv(rows: AdminPriceHistoryRow[]) {
  const lines = [headers, ...rows.map(row => [
    row.id,
    row.externalProductId,
    row.name,
    row.variantLabel,
    row.unitLabel,
    row.currentPrice,
    row.lowestPrice,
    row.source,
    row.refreshState,
    row.historyType === "admin_confirmed" ? "관리자 확인" : "공식 가격",
    row.price,
    row.recordedAt,
    row.note,
  ])].map(row => row.map(escapeCell).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
