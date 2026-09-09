import { timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";
import { refreshDeferredSearchPrices } from "./scheduledJobs";

let refreshRunning = false;

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
