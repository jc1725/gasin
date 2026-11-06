import { describe, expect, it } from "vitest";
import { EXTENSION_ALERT_FRESHNESS_DAYS, buildAlertObservationStatus, isFreshExtensionAlertObservation } from "./extensionAlertObservation";

describe("확장 프로그램 알림 관측 신선도", () => {
  const now = new Date("2026-08-26T00:00:00.000Z");

  it("7일 이내 관측만 알림 기준으로 인정한다", () => {
    expect(EXTENSION_ALERT_FRESHNESS_DAYS).toBe(7);
    expect(isFreshExtensionAlertObservation(new Date("2026-08-19T00:00:00.000Z"), now)).toBe(true);
    expect(isFreshExtensionAlertObservation(new Date("2026-08-18T23:59:59.999Z"), now)).toBe(false);
    expect(isFreshExtensionAlertObservation(null, now)).toBe(false);
  });
});

describe("알림 관측 상태 (수집기·공식 API 구분 없이 최신 확인값)", () => {
  const now = new Date("2026-08-26T00:00:00.000Z");

  it("최근 확인된 재고 있는 상품은 현재가를 알림 기준 가격으로 쓴다", () => {
    const seenAt = new Date("2026-08-25T12:00:00.000Z");
    expect(buildAlertObservationStatus({ id: 7, currentPrice: 12_900, lastSeenAt: seenAt, inStock: true }, now)).toEqual({ productId: 7, price: 12_900, observedAt: seenAt, isFresh: true });
  });

  it("7일이 지난 확인값은 가격은 남기되 신선하지 않다고 표시한다", () => {
    const seenAt = new Date("2026-08-18T23:59:59.999Z");
    expect(buildAlertObservationStatus({ id: 7, currentPrice: 12_900, lastSeenAt: seenAt, inStock: true }, now)).toMatchObject({ price: 12_900, isFresh: false });
  });

  it("품절이거나 가격이 0 이하이면 알림 기준 가격이 없다", () => {
    const seenAt = new Date("2026-08-25T12:00:00.000Z");
    expect(buildAlertObservationStatus({ id: 7, currentPrice: 12_900, lastSeenAt: seenAt, inStock: false }, now)).toMatchObject({ price: null, isFresh: false });
    expect(buildAlertObservationStatus({ id: 7, currentPrice: 0, lastSeenAt: seenAt, inStock: true }, now)).toMatchObject({ price: null, isFresh: false });
  });
});
