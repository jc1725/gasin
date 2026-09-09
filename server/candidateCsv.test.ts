import { describe, expect, it } from "vitest";
import { parseCandidateCsv } from "./candidateCsv";

describe("candidate CSV parser", () => {
  it("parses Korean headers and produces a stable de-duplication key", () => {
    const [row] = parseCandidateCsv("상품명,옵션명,원본 URL,메모\n테스트 세제,1L 2개,https://www.coupang.com/vp/products/123,후보\n");
    expect(row).toMatchObject({ name: "테스트 세제", optionLabel: "1L 2개", sourceUrl: "https://www.coupang.com/vp/products/123", notes: "후보" });
    expect(row?.sourceKey).toHaveLength(64);
  });

  it("supports quoted commas and removes duplicate candidate rows without any external request", () => {
    const rows = parseCandidateCsv('상품명,옵션명,원본 URL\n"비타민, C",1개,https://example.com/item\n"비타민, C",1개,https://example.com/item\n');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("비타민, C");
  });

  it("requires a product-name header and rejects malformed URLs", () => {
    expect(() => parseCandidateCsv("옵션명\n1개\n")).toThrow("상품명");
    expect(() => parseCandidateCsv("상품명,원본 URL\n테스트,not a url\n")).toThrow("원본 URL");
  });
});
