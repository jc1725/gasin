import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("HotDeals public purchase UI", () => {
  const source = readFileSync(new URL("./HotDeals.tsx", import.meta.url), "utf8");
  it("loads public deals and opens a safe external purchase link", () => {
    expect(source).toContain("trpc.hotDeals.list.useQuery()");
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="nofollow sponsored noopener noreferrer"');
    expect(source).toContain("스마트스토어로 구매하기");
    expect(source).toContain("놓치기 아쉬운 오늘의 특가");
    expect(source).toContain("특가 기간 · {period}");
  });
});
