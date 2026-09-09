import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("관리자 옵션 보완 목록", () => {
  it("optionName 없이 수집된 단일 SKU는 보완 대상에서 제외한다", () => {
    expect(db).toContain('ne(products.source, "collection")');
  });
});
