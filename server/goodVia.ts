import type { Request } from "express";
import * as db from "./db";

// 2026-10-01 리뉴얼 2단계: 착한경유(가신 → 쿠팡 이동) 클릭 기록.
//
// - 기록은 "이동 버튼을 누른 횟수"일 뿐 구매·수익과 연결하지 않는다.
// - 실패해도 사용자의 이동을 막지 않도록 항상 조용히 끝난다(호출부는 결과를 기다리지 않는다).
// - 공개 프로시저라 반복 호출로 행을 불리지 못하게 회원/IP별로 분당 횟수를 제한한다.
//   IP는 제한 키로 메모리에만 쓰고 DB에는 저장하지 않는다.

export const GOOD_VIA_RATE_WINDOW_MS = 60_000;
export const GOOD_VIA_RATE_MAX_PER_WINDOW = 30;
const MAX_TRACKED_KEYS = 10_000;

const buckets = new Map<string, { windowStart: number; count: number }>();

export function resetGoodViaRateLimit() {
  buckets.clear();
}

export function allowGoodViaRecord(key: string, now = Date.now()) {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= GOOD_VIA_RATE_WINDOW_MS) {
    if (buckets.size >= MAX_TRACKED_KEYS) {
      // tsconfig 타깃이 Map 직접 순회(for...of)를 허용하지 않아 forEach를 쓴다.
      buckets.forEach((stored, storedKey) => {
        if (now - stored.windowStart >= GOOD_VIA_RATE_WINDOW_MS) buckets.delete(storedKey);
      });
      if (buckets.size >= MAX_TRACKED_KEYS) return false;
    }
    buckets.set(key, { windowStart: now, count: 1 });
    return true;
  }
  if (bucket.count >= GOOD_VIA_RATE_MAX_PER_WINDOW) return false;
  bucket.count += 1;
  return true;
}

/** 한국 시간 기준 날짜(YYYY-MM-DD). 회원 화면의 "이번 달" 집계가 KST 경계를 쓰기 때문이다. */
export function toKstDayKey(date: Date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getClientAddress(req: Pick<Request, "headers" | "socket">) {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.socket?.remoteAddress || "unknown";
}

export type GoodViaRecordResult = { recorded: boolean; reason?: "rate_limited" | "error" };

export async function recordGoodViaFromRequest(input: {
  req: Pick<Request, "headers" | "socket">;
  userId: number | null;
  productId: number;
  source: "product" | "url";
  now?: Date;
}): Promise<GoodViaRecordResult> {
  const now = input.now ?? new Date();
  const limitKey = input.userId ? `user:${input.userId}` : `ip:${getClientAddress(input.req)}`;
  if (!allowGoodViaRecord(limitKey, now.getTime())) return { recorded: false, reason: "rate_limited" };
  try {
    await db.recordGoodViaClick({ userId: input.userId, productId: input.productId, source: input.source, dayKey: toKstDayKey(now), createdAt: now });
    return { recorded: true };
  } catch (error) {
    // 마이그레이션(drizzle/0042) 적용 전이거나, 그 사이 상품이 삭제돼 FK가 맞지 않는 경우 등.
    console.warn("[GoodVia] 클릭 기록 실패:", error instanceof Error ? error.message : error);
    return { recorded: false, reason: "error" };
  }
}
