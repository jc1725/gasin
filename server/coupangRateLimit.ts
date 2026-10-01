// 공식 분당 최대치보다 여유를 둔 전역 예산이다. 검색·가격 추적·GoldBox·딥링크 호출을 합산한다.
export const COUPANG_API_MAX_CALLS_PER_MINUTE = 46;
export const COUPANG_TRACKING_BUDGET_WEIGHT = 7;
export const COUPANG_USER_SEARCH_BUDGET_WEIGHT = 3;
const COUPANG_BUDGET_WEIGHT_TOTAL = COUPANG_TRACKING_BUDGET_WEIGHT + COUPANG_USER_SEARCH_BUDGET_WEIGHT;
export const COUPANG_TRACKING_MAX_CALLS_PER_MINUTE = Math.floor(
  COUPANG_API_MAX_CALLS_PER_MINUTE * COUPANG_TRACKING_BUDGET_WEIGHT / COUPANG_BUDGET_WEIGHT_TOTAL
);
export const COUPANG_USER_SEARCH_MAX_CALLS_PER_MINUTE = COUPANG_API_MAX_CALLS_PER_MINUTE - COUPANG_TRACKING_MAX_CALLS_PER_MINUTE;

/**
 * 2026-10-01: 가격 추적 호출이 전역 창에서 쓸 수 있는 상한.
 *
 * 예산은 전역 46 = 가격추적 32 + 사용자검색 14로 나뉘어 있었지만, 전역 창과 카테고리
 * 창이 서로 독립적으로 굴러가서 "검색 몫 14회는 항상 남는다"가 실제로는 보장되지
 * 않았다. 추적 창이 전역 창과 어긋나 걸쳐 있으면 한 전역 창 안에서 추적 호출만으로
 * 46을 채울 수 있고, 그러면 그 분에는 사용자 검색이 창이 멀쩡히 비어 있는데도
 * minute-limit으로 거부된다(2026-10-01 오후 1시 28분 "상품 검색 API 한도 초과"가
 * 이 경로였다 — 수집기 딥링크 생성이 전역 예산을 메우고 있었다).
 *
 * 그래서 추적 호출은 전역 창에서도 검색 몫을 뺀 만큼까지만 쓰게 한다. 전역 창에
 * 항상 검색용 자리가 남으므로 창이 어긋나도 검색이 굶지 않는다. 추적 쪽 처리량은
 * 정상 상태에서 달라지지 않는다(어차피 분당 32가 상한이었다).
 */
export const COUPANG_TRACKING_GLOBAL_MAX_CALLS_PER_MINUTE =
  COUPANG_API_MAX_CALLS_PER_MINUTE - COUPANG_USER_SEARCH_MAX_CALLS_PER_MINUTE;
export type CoupangApiCallType = "price-tracking" | "product-search";
const MINUTE_MS = 60 * 1000;

export type CoupangRateLimitSnapshot = {
  windowStartedAt: Date;
  callCount: number;
  lastCallAt: Date | null;
  blockedUntil: Date | null;
};

export type CoupangRateLimitDecision = {
  allowed: boolean;
  reason?: "minute-limit" | "emergency-block";
  retryAt?: Date;
  next: { windowStartedAt: Date; callCount: number; lastCallAt: Date; blockedUntil: Date | null; lastError: string | null };
};

export class CoupangRateLimitError extends Error {
  constructor(public readonly retryAt: Date, public readonly reason: string) {
    super(`Coupang API 보호 모드: ${retryAt.toISOString()} 이후 재개 (${reason})`);
    this.name = "CoupangRateLimitError";
  }
}

export function decideCoupangRateLimit(snapshot: CoupangRateLimitSnapshot | null, now = new Date(), maxCalls = COUPANG_API_MAX_CALLS_PER_MINUTE): CoupangRateLimitDecision {
  const resetWindow = !snapshot || now.getTime() - snapshot.windowStartedAt.getTime() >= MINUTE_MS;
  const base = resetWindow
    ? { windowStartedAt: now, callCount: 0, lastCallAt: null, blockedUntil: snapshot?.blockedUntil ?? null }
    : snapshot;
  const nextBase = { windowStartedAt: base.windowStartedAt, callCount: base.callCount, lastCallAt: now, blockedUntil: base.blockedUntil, lastError: null };
  if (base.blockedUntil && base.blockedUntil > now) return { allowed: false, reason: "emergency-block", retryAt: base.blockedUntil, next: nextBase };
  if (base.callCount >= maxCalls) return { allowed: false, reason: "minute-limit", retryAt: new Date(base.windowStartedAt.getTime() + MINUTE_MS), next: nextBase };
  return { allowed: true, next: { ...nextBase, callCount: base.callCount + 1 } };
}

export function getCoupangRateLimitRetryAt(message: string, fallbackNow = new Date()) {
  const match = message.match(/(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z?/);
  const normalized = match
    ? `${match[1]}.${(match[2] ?? "0").slice(0, 3).padEnd(3, "0")}Z`
    : null;
  const parsed = normalized ? new Date(normalized) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(fallbackNow.getTime() + MINUTE_MS);
}
