import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Home.tsx", import.meta.url), "utf8");

describe("Home Coupang widget", () => {
  it("renders the requested affiliate iframe and keeps the main search entry separate", () => {
    expect(source).toContain('href="/search"');
    expect(source).toContain('src="https://coupa.ng/cphOHP"');
    expect(source).toContain('title="쿠팡 상품 위젯"');
    expect(source).toContain('referrerPolicy="unsafe-url"');
    expect(source).not.toContain("COUPANG SEARCH");
  });
});
