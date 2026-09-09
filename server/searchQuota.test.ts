import { describe, expect, it } from "vitest";
import { decideSearchQuota, SEARCH_API_MAX_CALLS_PER_MINUTE } from "./searchQuota";

const start = new Date("2026-08-14T00:00:00.000Z");

describe("decideSearchQuota", () => {
  it("permits the first external search and reserves one call", () => {
    const decision = decideSearchQuota(null, start);
    expect(decision.allowed).toBe(true);
    expect(decision.next.callCount).toBe(1);
  });

  it("allows repeated searches inside the minute while the global API budget remains the final guard", () => {
    const snapshot = { windowStartedAt: start, callCount: 1, lastCallAt: start, blockedUntil: null };
    const decision = decideSearchQuota(snapshot, new Date(start.getTime() + 1_000));
    expect(decision).toMatchObject({ allowed: true, next: { callCount: 2 } });
  });

  it("keeps the user-search budget at 14 calls per minute, the 30% portion of 46", () => {
    const snapshot = { windowStartedAt: start, callCount: SEARCH_API_MAX_CALLS_PER_MINUTE, lastCallAt: start, blockedUntil: null };
    const decision = decideSearchQuota(snapshot, new Date(start.getTime() + 1_000));
    expect(decision).toMatchObject({ allowed: false, reason: "minute-limit", retryAt: new Date(start.getTime() + 60_000) });
  });

  it("honors an emergency block without consuming additional calls", () => {
    const blockedUntil = new Date(start.getTime() + 30 * 60 * 1000);
    const decision = decideSearchQuota({ windowStartedAt: start, callCount: 1, lastCallAt: start, blockedUntil }, new Date(start.getTime() + 1_000));
    expect(decision).toMatchObject({ allowed: false, reason: "emergency-block", retryAt: blockedUntil });
  });
});
