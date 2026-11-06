export const EXTENSION_ALERT_FRESHNESS_DAYS = 7;
export const EXTENSION_ALERT_FRESHNESS_MS = EXTENSION_ALERT_FRESHNESS_DAYS * 24 * 60 * 60 * 1000;

export function isFreshExtensionAlertObservation(observedAt: Date | null | undefined, now = new Date()) {
  return Boolean(observedAt && observedAt.getTime() >= now.getTime() - EXTENSION_ALERT_FRESHNESS_MS);
}

export type AlertObservationStatus = {
  productId: number;
  price: number | null;
  observedAt: Date | null;
  isFresh: boolean;
};

/**
 * 2026-11-06: 알림은 수집기(확장 프로그램)든 쿠팡 파트너스 공식 API든 상관없이 가신이 가장
 * 최근에 확인한 가격(products.currentPrice / lastSeenAt)을 기준으로 판정한다. 두 경로 모두
 * 같은 행을 갱신하므로 이 값이 곧 "최신 확인값"이다. 품절이거나 가격이 없으면 알림 기준이 아니다.
 */
export function buildAlertObservationStatus(
  row: { id: number; currentPrice: number; lastSeenAt: Date | null; inStock: boolean },
  now = new Date(),
): AlertObservationStatus {
  const hasPrice = row.inStock && Number.isSafeInteger(row.currentPrice) && row.currentPrice > 0;
  const price = hasPrice ? row.currentPrice : null;
  const observedAt = row.lastSeenAt ?? null;
  return { productId: row.id, price, observedAt, isFresh: price !== null && isFreshExtensionAlertObservation(observedAt, now) };
}
