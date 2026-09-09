import crypto from "node:crypto";

export type UserConfirmedPriceCsvRow = {
  name: string;
  optionLabel: string | null;
  checkedAt: Date;
  price: number;
  sourceUrl: string;
  externalProductId: string;
  note: string | null;
  importKey: string;
};

function parseCsvRecords(input: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index] ?? "";
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else value += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      record.push(value.trim());
      value = "";
    } else if (char === "\n") {
      record.push(value.trim());
      if (record.some(cell => cell.length > 0)) records.push(record);
      record = [];
      value = "";
    } else if (char !== "\r") value += char;
  }
  record.push(value.trim());
  if (record.some(cell => cell.length > 0)) records.push(record);
  return records;
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, "");
}

function pickColumn(headers: string[], aliases: string[]) {
  return headers.findIndex(header => aliases.includes(header));
}

function optional(value: string | undefined, maxLength: number) {
  const cleaned = value?.trim().slice(0, maxLength) ?? "";
  return cleaned || null;
}

function parsePrice(value: string | undefined, line: number) {
  const digits = (value ?? "").replace(/[₩원,\s]/g, "");
  if (!/^\d+$/.test(digits)) throw new Error(`${line}행의 확인 가격은 0보다 큰 정수여야 합니다.`);
  const price = Number(digits);
  if (!Number.isSafeInteger(price) || price <= 0 || price > 100_000_000) throw new Error(`${line}행의 확인 가격 범위가 올바르지 않습니다.`);
  return price;
}

function parseCheckedAt(value: string | undefined, line: number) {
  const raw = (value ?? "").trim();
  if (!raw) throw new Error(`${line}행의 확인일시가 필요합니다.`);
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00+09:00` : `${raw.replace(" ", "T")}${/[zZ]|[+-]\d\d:\d\d$/.test(raw) ? "" : "+09:00"}`;
  const checkedAt = new Date(normalized);
  if (Number.isNaN(checkedAt.getTime())) throw new Error(`${line}행의 확인일시는 YYYY-MM-DD HH:mm 형식이어야 합니다.`);
  if (checkedAt.getTime() > Date.now() + 5 * 60_000) throw new Error(`${line}행의 확인일시는 미래 시각일 수 없습니다.`);
  return checkedAt;
}

function getExternalProductId(sourceUrl: string, line: number, explicitIds?: { productId: string | null; itemId: string | null; vendorItemId: string | null }) {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error(`${line}행의 쿠팡 링크 형식이 올바르지 않습니다.`);
  }
  const pageMatch = url.pathname.match(/\/products\/(\d+)/);
  const productId = explicitIds?.productId ?? pageMatch?.[1] ?? null;
  const itemId = explicitIds?.itemId ?? url.searchParams.get("itemId");
  const vendorItemId = explicitIds?.vendorItemId ?? url.searchParams.get("vendorItemId");
  if (!productId || !itemId || !vendorItemId || !/^\d+$/.test(productId) || !/^\d+$/.test(itemId) || !/^\d+$/.test(vendorItemId)) {
    throw new Error(`${line}행의 쿠팡 링크 또는 별도 productId·itemId·vendorItemId 열이 모두 필요합니다.`);
  }
  return `${productId}:${itemId}:${vendorItemId}`;
}

export function parseUserConfirmedPriceCsv(csvText: string, options?: { allowEmpty?: boolean }): UserConfirmedPriceCsvRow[] {
  if (csvText.length > 250_000) throw new Error("CSV 파일은 250KB 이하만 가져올 수 있습니다.");
  const records = parseCsvRecords(csvText);
  if (records.length === 0) throw new Error("CSV 헤더가 필요합니다.");
  if (records.length < 2 && !options?.allowEmpty) throw new Error("헤더와 가격 확인 행을 포함한 CSV 파일이 필요합니다.");
  const headers = records[0]!.map(normalizeHeader);
  const nameIndex = pickColumn(headers, ["상품명", "name", "productname"]);
  const optionIndex = pickColumn(headers, ["옵션명", "option", "optionlabel", "용량/수량"]);
  const checkedAtIndex = pickColumn(headers, ["확인일시", "확인일", "checkedat", "date"]);
  const priceIndex = pickColumn(headers, ["확인가격", "가격", "price"]);
  const urlIndex = pickColumn(headers, ["쿠팡링크", "쿠팡 링크", "링크", "url", "sourceurl"]);
  const noteIndex = pickColumn(headers, ["메모", "notes", "note"]);
  const productIdIndex = pickColumn(headers, ["productid", "상품id", "상품아이디"]);
  const itemIdIndex = pickColumn(headers, ["itemid", "아이템id", "아이템아이디"]);
  const vendorItemIdIndex = pickColumn(headers, ["vendoritemid", "vendoritemid", "판매자상품옵션id"]);
  if (nameIndex < 0 || checkedAtIndex < 0 || priceIndex < 0 || urlIndex < 0) throw new Error("CSV 첫 행에 ‘상품명’, ‘확인일시’, ‘확인 가격’, ‘쿠팡 링크’ 열이 필요합니다.");

  const rows = records.slice(1).flatMap((record, index) => {
    const line = index + 2;
    const name = optional(record[nameIndex], 500);
    if (!name) return [];
    const sourceUrl = optional(record[urlIndex], 2_000);
    if (name === "예시 상품" && sourceUrl?.includes("/products/123456")) return [];
    if (!sourceUrl) throw new Error(`${line}행의 쿠팡 링크가 필요합니다.`);
    const checkedAt = parseCheckedAt(record[checkedAtIndex], line);
    const price = parsePrice(record[priceIndex], line);
    const explicitIds = productIdIndex >= 0 || itemIdIndex >= 0 || vendorItemIdIndex >= 0 ? {
      productId: optional(record[productIdIndex], 40),
      itemId: optional(record[itemIdIndex], 40),
      vendorItemId: optional(record[vendorItemIdIndex], 40),
    } : undefined;
    const externalProductId = getExternalProductId(sourceUrl, line, explicitIds);
    const optionLabel = optionIndex >= 0 ? optional(record[optionIndex], 500) : null;
    const note = noteIndex >= 0 ? optional(record[noteIndex], 4_000) : null;
    const importKey = crypto.createHash("sha256").update([externalProductId, checkedAt.toISOString(), price, sourceUrl].join("\u001f"), "utf8").digest("hex");
    return [{ name, optionLabel, checkedAt, price, sourceUrl, externalProductId, note, importKey }];
  });
  if (rows.length === 0 && !options?.allowEmpty) throw new Error("가져올 수 있는 상품명이 없습니다.");
  if (rows.length > 200) throw new Error("한 번에 최대 200개 가격 확인 행만 가져올 수 있습니다.");
  return Array.from(new Map(rows.map(row => [row.importKey, row])).values());
}

export const userConfirmedPriceCsvTemplate = "상품명,옵션명,확인일시,확인 가격,쿠팡 링크,productId,itemId,vendorItemId,메모\n";
