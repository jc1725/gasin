import type { Request } from "express";

/**
 * 2026-11-21: "어제 업데이트 이후 검색 실패 이력이 늘어남" — 원인은 코드가 아니라 외부 자동화 도구였다.
 * Railway HTTP 로그에서 한 IP가 HeadlessChrome(같은 IP에서 "ProductComparisonResearch/1.0" UA도 사용)로
 * 약 13초마다 /search를 열고 "A6SL1LO10BLKS S", "LE6G002BGR 270" 같은 모델 코드를 검색하고 있었다.
 * 이런 검색은 매번 쿠팡 API 사용자 검색 몫을 쓰고, 결과가 없으면 검색 실패 이력에 쌓인다.
 *
 * 그래서 사용자 검색(catalog.search)에만 두 가지를 건다.
 * 1) 자동화 도구로 보이는 User-Agent는 검색을 받지 않는다(쿠팡 API 호출·실패 기록 없음).
 * 2) 같은 IP(로그인 시 같은 회원)는 10분에 20회까지만 검색할 수 있다. 사람은 이 한도에 거의 닿지 않는다.
 * 관리자는 둘 다 적용하지 않는다.
 */
const AUTOMATED_USER_AGENT_PATTERN = /headlesschrome|phantomjs|puppeteer|playwright|selenium|webdriver|bot\/|crawler|spider|slurp|python-requests|python-urllib|aiohttp|httpx|scrapy|curl\/|wget\/|go-http-client|node-fetch|axios\/|okhttp|java\/|libwww|productcomparisonresearch/i;

export function isAutomatedSearchClient(userAgent: string | undefined | null) {
  const ua = (userAgent ?? "").trim();
  if (!ua) return true;
  return AUTOMATED_USER_AGENT_PATTERN.test(ua);
}

export const SEARCH_RATE_LIMIT = { maxRequests: 20, windowMs: 10 * 60 * 1000 } as const;
const MAX_TRACKED_KEYS = 5_000;
const searchTimestampsByKey = new Map<string, number[]>();

/** 키별 최근 검색 시각을 기록하고, 한도를 넘었으면 false를 돌려준다(넘은 요청은 기록하지 않는다). */
export function consumeSearchAllowance(key: string, now = Date.now(), limit: { maxRequests: number; windowMs: number } = SEARCH_RATE_LIMIT) {
  const since = now - limit.windowMs;
  const recent = (searchTimestampsByKey.get(key) ?? []).filter(time => time > since);
  if (recent.length >= limit.maxRequests) {
    searchTimestampsByKey.set(key, recent);
    return { allowed: false as const, retryAt: new Date(recent[0]! + limit.windowMs) };
  }
  recent.push(now);
  searchTimestampsByKey.delete(key);
  searchTimestampsByKey.set(key, recent);
  while (searchTimestampsByKey.size > MAX_TRACKED_KEYS) {
    const oldestKey = searchTimestampsByKey.keys().next().value;
    if (oldestKey === undefined) break;
    searchTimestampsByKey.delete(oldestKey);
  }
  return { allowed: true as const };
}

export function resetSearchAllowanceForTests() {
  searchTimestampsByKey.clear();
}

export function getSearchClientKey(req: Pick<Request, "headers" | "socket"> | undefined, userId: number | null | undefined) {
  if (userId) return `user:${userId}`;
  const forwarded = req?.headers?.["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return `ip:${first || req?.socket?.remoteAddress || "unknown"}`;
}
