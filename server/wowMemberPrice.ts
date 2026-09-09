export type WowMemberPriceOverride = {
  wowMemberPrice: number | null;
  wowMemberPriceObservedAt: Date | null;
};

export const WOW_MEMBER_PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isPositivePrice(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** 수집기가 실제 회원 세션에서 확인한 적용가가 있으면 공식 API 기본가보다 우선합니다. */
export function chooseTrackedPrice(officialPrice: number, override: WowMemberPriceOverride | undefined, now = new Date()) {
  const memberPrice = override?.wowMemberPrice;
  return typeof memberPrice === "number" && hasWowMemberPrice(override, now) ? memberPrice : officialPrice;
}

export function hasWowMemberPrice(override: WowMemberPriceOverride | undefined, now = new Date()) {
  const observedAt = override?.wowMemberPriceObservedAt;
  return isPositivePrice(override?.wowMemberPrice)
    && observedAt instanceof Date
    && observedAt.getTime() <= now.getTime()
    && now.getTime() - observedAt.getTime() <= WOW_MEMBER_PRICE_MAX_AGE_MS;
}
