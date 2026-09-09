import { timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";
import { refreshDeferredSearchPrices } from "./scheduledJobs";
import { enqueueFavoritedProductsForPriceRefresh } from "./db";

let refreshRunning = false;
let favoritesRefreshRunning = false;

function matchesExternalScheduleToken(header: string | undefined) {
  const expected = ENV.gasynExternalScheduleToken;
  const received = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function registerExternalPriceRefreshRoute(
  app: Express,
  action: () => Promise<unknown> = refreshDeferredSearchPrices
) {
  app.post("/api/external/price-refresh", async (req: Request, res: Response) => {
    if (!matchesExternalScheduleToken(req.header("authorization"))) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (refreshRunning) {
      return res.status(202).json({ ok: true, accepted: true, skipped: "already-running" });
    }

    // cron-job.org의 30초 제한과 무관하게 요청은 즉시 승인하고,
    // 쿠팡 API·DB 작업은 서버 백그라운드에서 실행합니다.
    refreshRunning = true;
    void Promise.resolve().then(action).catch(error => {
      console.error("[External price refresh] background job failed", error);
    }).finally(() => {
      refreshRunning = false;
    });
    return res.status(202).json({ ok: true, accepted: true, message: "가격 갱신 작업을 백그라운드에서 시작했습니다." });
  });
}

/**
 * 찜한 상품을 정기적으로 수집기 가격 업데이트 대상(awaiting_collection)으로 등록합니다.
 * 기존에는 관리자가 /admin/prices에서 버튼을 눌러야만 실행되어, 사람이 잊으면 찜한
 * 상품의 검색 SKU 미일치가 수집기 재방문 없이 계속 방치됐습니다. 단순 UPDATE 쿼리라
 * 외부 API 호출이 없으므로 /api/external/price-refresh와 달리 백그라운드로 미룰
 * 필요 없이 즉시 처리하고 결과를 응답에 담아 cron-job.org 실행 로그에서 바로 확인할
 * 수 있게 합니다.
 */
export function registerExternalFavoritesRefreshRoute(
  app: Express,
  action: () => Promise<{ favoriteCount: number; queuedCount: number; skippedCount: number }> = enqueueFavoritedProductsForPriceRefresh
) {
  app.post("/api/external/favorites-refresh", async (req: Request, res: Response) => {
    if (!matchesExternalScheduleToken(req.header("authorization"))) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (favoritesRefreshRunning) {
      return res.status(202).json({ ok: true, accepted: true, skipped: "already-running" });
    }
    favoritesRefreshRunning = true;
    try {
      const result = await action();
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      console.error("[External favorites refresh] job failed", error);
      return res.status(500).json({ ok: false, error: "찜한 상품 수집기 대기열 등록에 실패했습니다." });
    } finally {
      favoritesRefreshRunning = false;
    }
  });
}
