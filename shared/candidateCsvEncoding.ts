const nameHeaders = new Set(["상품명", "name", "productname"]);

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, "");
}

function hasCandidateNameHeader(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.split(",").some(column => nameHeaders.has(normalizeHeader(column)));
}

/**
 * Korean Excel CSV files frequently use CP949/EUC-KR. Prefer UTF-8 when it
 * contains the required candidate header, then retry with euc-kr otherwise.
 */
export function decodeCandidateCsvBytes(input: ArrayBuffer | Uint8Array) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (hasCandidateNameHeader(utf8)) return utf8;

  const cp949 = new TextDecoder("euc-kr").decode(bytes);
  return hasCandidateNameHeader(cp949) ? cp949 : utf8;
}

export async function decodeCandidateCsvFile(file: File) {
  return decodeCandidateCsvBytes(await file.arrayBuffer());
}
