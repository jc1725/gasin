import { describe, expect, it } from "vitest";
import { COUPANG_API_MAX_CALLS_PER_MINUTE, COUPANG_TRACKING_BUDGET_WEIGHT, COUPANG_TRACKING_MAX_CALLS_PER_MINUTE, COUPANG_USER_SEARCH_BUDGET_WEIGHT, COUPANG_USER_SEARCH_MAX_CALLS_PER_MINUTE, decideCoupangRateLimit, getCoupangRateLimitRetryAt } from "./coupangRateLimit";

describe("Coupang global minute-rate protection", () => {
  it("splits the 46-call global budget into 32 tracking calls and 14 user-search calls", () => {
    expect(COUPANG_TRACKING_BUDGET_WEIGHT).toBe(7);
    expect(COUPANG_USER_SEARCH_BUDGET_WEIGHT).toBe(3);
    expect(COUPANG_TRACKING_MAX_CALLS_PER_MINUTE).toBe(32);
    expect(COUPANG_USER_SEARCH_MAX_CALLS_PER_MINUTE).toBe(14);
    expect(COUPANG_TRACKING_MAX_CALLS_PER_MINUTE + COUPANG_USER_SEARCH_MAX_CALLS_PER_MINUTE).toBe(COUPANG_API_MAX_CALLS_PER_MINUTE);
  });

  it("keeps a safety margin below 50 calls and blocks the next request until the next minute", () => {
    const windowStartedAt = new Date("2026-08-15T17:06:00.000Z");
    const now = new Date("2026-08-15T17:06:45.000Z");
    const snapshot = { windowStartedAt, callCount: COUPANG_API_MAX_CALLS_PER_MINUTE, lastCallAt: now, blockedUntil: null };

    expect(COUPANG_API_MAX_CALLS_PER_MINUTE).toBe(46);
    expect(decideCoupangRateLimit(snapshot, now)).toMatchObject({
      allowed: false,
      reason: "minute-limit",
      retryAt: new Date("2026-08-15T17:07:00.000Z"),
    });
  });

  it("honors an upstream protection time and safely parses a high-precision error timestamp", () => {
    const retryAt = getCoupangRateLimitRetryAt("웹 상에서의 요청이 분당 50회를 초과했습니다. 2026-08-15T17:06:50.551237783 이후에 다시 시도해 주시기 바랍니다.");
    expect(retryAt).toEqual(new Date("2026-08-15T17:06:50.551Z"));
    const decision = decideCoupangRateLimit({
      windowStartedAt: new Date("2026-08-15T17:06:00.000Z"),
      callCount: 1,
      lastCallAt: null,
      blockedUntil: retryAt,
    }, new Date("2026-08-15T17:06:45.000Z"));
    expect(decision).toMatchObject({ allowed: false, reason: "emergency-block", retryAt });
  });
});
