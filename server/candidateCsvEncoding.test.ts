import { describe, expect, it } from "vitest";
import { decodeCandidateCsvBytes } from "../shared/candidateCsvEncoding";
import { parseCandidateCsv } from "./candidateCsv";

const cp949Fixture = "u/PHsLjtLL/JvMe47Sy/+Lq7IFVSTCy43rjwDQrHx8H2v8Cw1iC1pcDPuK4guPDAzL26w8Qgxde288fHILqjwMy68SC3zrzHLCI0MDBtbCwgMrCzIixodHRwczovL3d3dy5jb3VwYW5nLmNvbS92cC9wcm9kdWN0cy82NTM5MTcxNzM1P2l0ZW1JZD0yMTU1NDE0MjM4OSZ2ZW5kb3JJdGVtSWQ9ODg2MDY3NTc0MTEmc291cmNlVHlwZT1zcnBfcHJvZHVjdF9hZHMmY2xpY2tFdmVudElkPWM1ODY1MGIwLTk5MzAtMTFmMS04OTgwLWE4ZDE1OTUyODc3YyZrb3JlUGxhY2VtZW50PTE1JmtvcmVTdWJQbGFjZW1lbnQ9NSZjbGlja0V2ZW50SWQ9YzU4NjUwYjAtOTkzMC0xMWYxLTg5ODAtYThkMTU5NTI4NzdjJmtvcmVQbGFjZW1lbnQ9MTUma29yZVN1YlBsYWNlbWVudD01";

describe("decodeCandidateCsvBytes", () => {
  it("keeps a UTF-8 candidate CSV unchanged", () => {
    const input = new TextEncoder().encode("상품명,옵션명,원본 URL,메모\n테스트 상품,1개,https://www.coupang.com/vp/products/1,검증");
    expect(decodeCandidateCsvBytes(input)).toContain("테스트 상품");
  });

  it("decodes a CP949 Korean Excel CSV with the required 상품명 header", () => {
    const input = Buffer.from(cp949Fixture, "base64");
    const decoded = decodeCandidateCsvBytes(input);

    expect(decoded).toContain("상품명,옵션명,원본 URL,메모");
    expect(decoded).toContain("피지오겔 데일리 모이스쳐 테라피 베이비 로션");
    expect(decoded).toContain('"400ml, 2개"');

    const [candidate] = parseCandidateCsv(decoded);
    expect(candidate).toMatchObject({
      name: "피지오겔 데일리 모이스쳐 테라피 베이비 로션",
      optionLabel: "400ml, 2개",
      sourceUrl: expect.stringContaining("coupang.com/vp/products/6539171735"),
    });
  });
});
