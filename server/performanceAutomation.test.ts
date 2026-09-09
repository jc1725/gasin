import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { LighthouseQuotaExceededError, isLighthouseQuotaError, parseAudit, LIGHTHOUSE_BUDGET } from "./lighthouseAudit";

const kakaoSource = readFileSync(new URL("./kakaoAuth.ts", import.meta.url), "utf8");

describe("Kakao returnTo and performance automation", () => {
  it("stores only an internal returnTo and redirects the callback to it", () => {
    expect(kakaoSource).toContain("KAKAO_RETURN_TO_COOKIE");
    expect(kakaoSource).toContain("normalizeReturnTo");
    expect(kakaoSource).toContain("res.redirect(302, returnTo)");
    expect(kakaoSource).toContain("value.startsWith(\"//\")");
  });

  it("classifies PageSpeed quota exhaustion for backoff without treating it as a site failure", () => {
    const error = new LighthouseQuotaExceededError("Quota exceeded for quota metric 'Queries per day'");
    expect(isLighthouseQuotaError(error)).toBe(true);
    expect(error.retryAt.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
  });

  it("flags Lighthouse metrics above the mobile budget", () => {
    const result = parseAudit({
      lighthouseResult: {
        categories: { performance: { score: 0.82 } },
        audits: {
          "largest-contentful-paint": { numericValue: 3100 },
          "first-contentful-paint": { numericValue: 2100 },
          "total-blocking-time": { numericValue: 250 },
          "cumulative-layout-shift": { numericValue: 0.14 },
          "resource-summary": { details: { items: [{ resourceType: "Script", transferSize: 400 * 1024 }] } },
        },
      },
    }, "https://gasin.shop/");
    expect(result.performanceScore).toBe(82);
    expect(result.budgetExceeded).toHaveLength(5);
    expect(LIGHTHOUSE_BUDGET.jsBytes).toBe(360 * 1024);
  });
});
