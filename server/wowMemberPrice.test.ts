import { describe, expect, it } from "vitest";
import { chooseTrackedPrice, hasWowMemberPrice, WOW_MEMBER_PRICE_MAX_AGE_MS } from "./wowMemberPrice";

describe("와우 회원가 우선 정책", () => {
  it("수집기가 확인한 유효한 회원 적용가를 공식 API 기본가보다 우선한다", () => {
    const observedAt = new Date("2026-08-26T00:26:04.000Z");
    const now = new Date("2026-08-26T12:00:00.000Z");
    expect(chooseTrackedPrice(15_610, { wowMemberPrice: 14_040, wowMemberPriceObservedAt: observedAt }, now)).toBe(14_040);
    expect(hasWowMemberPrice({ wowMemberPrice: 14_040, wowMemberPriceObservedAt: observedAt }, now)).toBe(true);
  });

  it("수집기 회원가가 없거나 유효하지 않으면 공식 API 기본가를 사용한다", () => {
    expect(chooseTrackedPrice(15_610, { wowMemberPrice: null, wowMemberPriceObservedAt: null })).toBe(15_610);
    expect(chooseTrackedPrice(15_610, { wowMemberPrice: 0, wowMemberPriceObservedAt: new Date() })).toBe(15_610);
    expect(hasWowMemberPrice({ wowMemberPrice: 14_040, wowMemberPriceObservedAt: null })).toBe(false);
  });

  it("24시간보다 오래된 회원 적용가는 자동 갱신에서 공식 API 기본가로 되돌린다", () => {
    const now = new Date("2026-08-27T00:26:05.000Z");
    const staleObservedAt = new Date(now.getTime() - WOW_MEMBER_PRICE_MAX_AGE_MS - 1);
    const override = { wowMemberPrice: 14_040, wowMemberPriceObservedAt: staleObservedAt };
    expect(hasWowMemberPrice(override, now)).toBe(false);
    expect(chooseTrackedPrice(15_610, override, now)).toBe(15_610);
  });
});
