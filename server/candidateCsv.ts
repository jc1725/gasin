import crypto from "node:crypto";

export type CandidateCsvRow = {
  name: string;
  optionLabel: string | null;
  sourceUrl: string | null;
  notes: string | null;
  sourceKey: string;
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

function cleanOptional(value: string | undefined, maxLength: number) {
  const cleaned = value?.trim().slice(0, maxLength) ?? "";
  return cleaned || null;
}

function buildSourceKey(row: Omit<CandidateCsvRow, "sourceKey">) {
  const raw = [row.name, row.optionLabel ?? "", row.sourceUrl ?? "", row.notes ?? ""].join("\u001f").toLowerCase();
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

export function parseCandidateCsv(csvText: string): CandidateCsvRow[] {
  if (csvText.length > 250_000) throw new Error("CSV 파일은 250KB 이하만 가져올 수 있습니다.");
  const records = parseCsvRecords(csvText);
  if (records.length < 2) throw new Error("헤더와 상품 행을 포함한 CSV 파일이 필요합니다.");
  const headers = records[0]!.map(normalizeHeader);
  const nameIndex = pickColumn(headers, ["상품명", "name", "productname"]);
  const optionIndex = pickColumn(headers, ["옵션명", "option", "optionlabel", "용량/수량"]);
  const urlIndex = pickColumn(headers, ["원본 url", "원본url", "url", "sourceurl", "쿠팡url"]);
  const notesIndex = pickColumn(headers, ["메모", "notes", "note"]);
  if (nameIndex < 0) throw new Error("CSV 첫 행에 ‘상품명’ 열이 필요합니다.");

  const rows = records.slice(1).flatMap((record, rowIndex) => {
    const name = cleanOptional(record[nameIndex], 500);
    if (!name) return [];
    const sourceUrl = urlIndex >= 0 ? cleanOptional(record[urlIndex], 2_000) : null;
    if (sourceUrl) {
      try {
        new URL(sourceUrl);
      } catch {
        throw new Error(`${rowIndex + 2}행의 원본 URL 형식이 올바르지 않습니다.`);
      }
    }
    const row = {
      name,
      optionLabel: optionIndex >= 0 ? cleanOptional(record[optionIndex], 500) : null,
      sourceUrl,
      notes: notesIndex >= 0 ? cleanOptional(record[notesIndex], 4_000) : null,
    };
    return [{ ...row, sourceKey: buildSourceKey(row) }];
  });
  if (rows.length === 0) throw new Error("가져올 수 있는 상품명이 없습니다.");
  if (rows.length > 200) throw new Error("한 번에 최대 200개 상품 후보만 가져올 수 있습니다.");
  return Array.from(new Map(rows.map(row => [row.sourceKey, row])).values());
}

export const candidateCsvTemplate = "상품명,옵션명,원본 URL,메모\n예시 상품,500ml 2개,https://www.coupang.com/vp/products/123456,가격 추적 후보\n";
