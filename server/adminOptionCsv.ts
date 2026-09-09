import { decodeCandidateCsvBytes } from "../shared/candidateCsvEncoding";

export type AdminOptionCsvRow = {
  line: number;
  productId: number | null;
  externalProductId: string | null;
  optionLabel: string | null;
  capacity: string | null;
  quantity: string | null;
};

function parseRecords(input: string) {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (const char of input) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (cell || row.length) { row.push(cell.trim()); rows.push(row); } row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter(values => values.some(Boolean));
}
function headerIndex(headers: string[], names: string[]) { return headers.findIndex(header => names.includes(header.replace(/\s/g, "").toLowerCase())); }
function optional(value: string | undefined) { const trimmed = value?.trim(); return trimmed ? trimmed : null; }

export function parseAdminOptionCsv(input: string | Uint8Array): AdminOptionCsvRow[] {
  const text = typeof input === "string" ? input : decodeCandidateCsvBytes(input);
  const records = parseRecords(text);
  if (!records.length) return [];
  const headers = records[0].map(value => value.replace(/^\ufeff/, "").toLowerCase());
  const productIdIndex = headerIndex(headers, ["productid", "상품id", "상품아이디"]);
  const skuIndex = headerIndex(headers, ["externalproductid", "sku", "상품sku", "쿠팡sku"]);
  const optionIndex = headerIndex(headers, ["옵션명", "옵션", "optionlabel"]);
  const capacityIndex = headerIndex(headers, ["용량", "capacity", "규격"]);
  const quantityIndex = headerIndex(headers, ["수량", "quantity", "개수"]);
  if (productIdIndex < 0 && skuIndex < 0) throw new Error("상품ID 또는 쿠팡 SKU 열이 필요합니다.");
  if (optionIndex < 0 && capacityIndex < 0 && quantityIndex < 0) throw new Error("옵션명·용량·수량 중 하나 이상의 열이 필요합니다.");
  return records.slice(1).map((record, offset) => {
    const rawProductId = productIdIndex >= 0 ? optional(record[productIdIndex]) : null;
    if (rawProductId && !/^\d+$/.test(rawProductId)) throw new Error(`${offset + 2}행의 상품ID가 올바르지 않습니다.`);
    return { line: offset + 2, productId: rawProductId ? Number(rawProductId) : null, externalProductId: skuIndex >= 0 ? optional(record[skuIndex]) : null, optionLabel: optionIndex >= 0 ? optional(record[optionIndex]) : null, capacity: capacityIndex >= 0 ? optional(record[capacityIndex]) : null, quantity: quantityIndex >= 0 ? optional(record[quantityIndex]) : null };
  });
}
