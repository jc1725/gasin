import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./GasynAppShell.tsx", import.meta.url), "utf8");

describe("GasynAppShell authentication controls", () => {
  it("shows visible Google and Kakao login actions for unauthenticated users", () => {
    expect(source).toContain("onClick={startLogin}");
    expect(source).toContain("Google 로그인");
    expect(source).toContain(">Google</span>");
    expect(source).toContain('href="/api/auth/kakao"');
    expect(source).toContain("카카오 로그인");
  });

  it("shows account context and a visible logout action for authenticated users", () => {
    expect(source).toContain("user ? (");
    expect(source).toContain("onClick={() => void logout()}");
    expect(source).toContain(">로그아웃</span>");
  });

  it("uses a Smartstore purchase notice on the hot-deal route", () => {
    expect(source).toContain('location.startsWith("/hot-deals")');
    expect(source).toContain("특가 상품의 구매는 해당 스마트스토어에서 진행되며");
  });

  it("labels the public Smartstore menu as a special offer", () => {
    expect(source).toContain('{ href: "/hot-deals", label: "특가", Icon: Flame }');
  });
});
