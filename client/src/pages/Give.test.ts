import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPageMeta } from "@/lib/seoMeta";

const give = readFileSync(new URL("./Give.tsx", import.meta.url), "utf8");
const summary = readFileSync(new URL("../components/GiveSummary.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const prefetch = readFileSync(new URL("../ssr/prefetch.ts", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/GasynAppShell.tsx", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("../../../server/seoSitemap.ts", import.meta.url), "utf8");
const ssrCache = readFileSync(new URL("../../../server/_core/vite.ts", import.meta.url), "utf8");

describe("GASIN GIVE 페이지 (리뉴얼 1단계)", () => {
  it("/give 라우트를 앱·SSR 허용 목록·SSR 캐시·사이트맵에 모두 등록한다", () => {
    expect(app).toContain('<Route path={"/give"} component={Give} />');
    expect(prefetch).toContain('path === "/give"');
    expect(ssrCache).toContain('pathname === "/give"');
    expect(sitemap).toContain('"/give"');
  });

  it("/give 전용 메타데이터를 가진다", () => {
    const meta = getPageMeta("/give");
    expect(meta.title).toContain("GASIN GIVE");
    expect(meta.description).toContain("수익금(세후)의 30%");
  });

  it("약속·고지 문구는 shared/give.ts의 상수로만 표시하고, 지급 전에는 금액을 보여 주지 않는다", () => {
    for (const source of [give, summary]) {
      expect(source).toContain("GIVE_PROMISE");
      expect(source).toContain("PARTNERS_DISCLOSURE");
      expect(source).toContain("describePayoutStatus");
      expect(source).not.toMatch(/\d{1,3}(,\d{3})+원/);
    }
  });

  it("푸터의 쿠팡 파트너스 고지 문구를 유지한 채 /give 링크를 더한다", () => {
    expect(shell).toContain("가신 링크 제품 구매시 쿠팡파트너스 활동의 일환으로 일정액의 수수료를 제공받습니다.");
    expect(shell).toContain('<Link href="/give"');
  });
});
