import { describe, expect, it } from "vitest";
import { EXTENSION_ALERT_FRESHNESS_DAYS, isFreshExtensionAlertObservation } from "./extensionAlertObservation";

describe("확장 프로그램 알림 관측 신선도", () => {
  const now = new Date("2026-08-26T00:00:00.000Z");

  it("7일 이내 관측만 알림 기준으로 인정한다", () => {
    expect(EXTENSION_ALERT_FRESHNESS_DAYS).toBe(7);
    expect(isFreshExtensionAlertObservation(new Date("2026-08-19T00:00:00.000Z"), now)).toBe(true);
    expect(isFreshExtensionAlertObservation(new Date("2026-08-18T23:59:59.999Z"), now)).toBe(false);
    expect(isFreshExtensionAlertObservation(null, now)).toBe(false);
  });
});
