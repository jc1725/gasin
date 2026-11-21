import { beforeEach, describe, expect, it } from "vitest";
import { consumeSearchAllowance, getSearchClientKey, isAutomatedSearchClient, resetSearchAllowanceForTests } from "./searchAbuseGuard";

describe("사용자 검색 남용 방지 (2026-11-21)", () => {
  beforeEach(() => resetSearchAllowanceForTests());

  it("헤드리스 브라우저·크롤러·스크립트 UA는 자동화 도구로 본다", () => {
    expect(isAutomatedSearchClient("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/158.0.0.0 Safari/537.36")).toBe(true);
    expect(isAutomatedSearchClient("ProductComparisonResearch/1.0")).toBe(true);
    expect(isAutomatedSearchClient("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isAutomatedSearchClient("python-requests/2.32.0")).toBe(true);
    expect(isAutomatedSearchClient("")).toBe(true);
  });

  it("일반 PC·모바일 브라우저와 앱 내 브라우저는 막지 않는다", () => {
    expect(isAutomatedSearchClient("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")).toBe(false);
    expect(isAutomatedSearchClient("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isAutomatedSearchClient("Mozilla/5.0 (Linux; Android 14; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 KAKAOTALK 10.8.0")).toBe(false);
  });

  it("같은 키는 10분에 20회까지만 허용하고, 창이 지나면 다시 허용한다", () => {
    const start = Date.parse("2026-11-21T09:55:00.000Z");
    for (let index = 0; index < 20; index += 1) expect(consumeSearchAllowance("ip:1.2.3.4", start + index * 1000).allowed).toBe(true);
    const blocked = consumeSearchAllowance("ip:1.2.3.4", start + 21_000);
    expect(blocked.allowed).toBe(false);
    expect(consumeSearchAllowance("ip:5.6.7.8", start + 21_000).allowed).toBe(true);
    expect(consumeSearchAllowance("ip:1.2.3.4", start + 10 * 60 * 1000 + 1).allowed).toBe(true);
  });

  it("로그인 회원은 회원 단위, 비로그인은 프록시 뒤 실제 IP 단위로 센다", () => {
    const req = { headers: { "x-forwarded-for": "130.62.1.142, 10.0.0.1" }, socket: { remoteAddress: "10.0.0.1" } } as never;
    expect(getSearchClientKey(req, null)).toBe("ip:130.62.1.142");
    expect(getSearchClientKey(req, 7)).toBe("user:7");
  });
});
