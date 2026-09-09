// 상품 검색은 공식 분당 최대치보다 낮게 별도 제한하고, 모든 쿠팡 호출은 전역 46회 예산도 통과해야 한다.
import { COUPANG_USER_SEARCH_MAX_CALLS_PER_MINUTE } from "./coupangRateLimit";

/** 전체 분당 안전 예산 중 사용자 상품 검색에 배정한 30% 예산입니다. */
export const SEARCH_API_MAX_CALLS_PER_MINUTE = COUPANG_USER_SEARCH_MAX_CALLS_PER_MINUTE;
const MINUTE_MS = 60 * 1000;

export type SearchQuotaSnapshot = {
  windowStartedAt: Date;
  callCount: number;
  lastCallAt: Date | null;
  blockedUntil: Date | null;
};

export type SearchQuotaDecision = {
  allowed: boolean;
  reason?: "minute-limit" | "emergency-block";
  retryAt?: Date;
  next: { windowStartedAt: Date; callCount: number; lastCallAt: Date; blockedUntil: Date | null; lastError?: string | null };
};

export function decideSearchQuota(snapshot: SearchQuotaSnapshot | null, now = new Date()): SearchQuotaDecision {
  const resetWindow = !snapshot || now.getTime() - snapshot.windowStartedAt.getTime() >= MINUTE_MS;
  const base = resetWindow
    ? { windowStartedAt: now, callCount: 0, lastCallAt: null, blockedUntil: snapshot?.blockedUntil ?? null }
    : snapshot;
  const nextBase = { windowStartedAt: base.windowStartedAt, callCount: base.callCount, lastCallAt: now, blockedUntil: base.blockedUntil, lastError: null };
  if (base.blockedUntil && base.blockedUntil > now) return { allowed: false, reason: "emergency-block", retryAt: base.blockedUntil, next: nextBase };
  if (base.callCount >= SEARCH_API_MAX_CALLS_PER_MINUTE) return { allowed: false, reason: "minute-limit", retryAt: new Date(base.windowStartedAt.getTime() + MINUTE_MS), next: nextBase };
  return { allowed: true, next: { ...nextBase, callCount: base.callCount + 1 } };
}
