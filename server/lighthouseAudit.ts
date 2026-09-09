import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import * as db from "./db";

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const TARGET_URL = ENV.appBaseUrl;
export const LIGHTHOUSE_BUDGET = {
  lcpMs: 2500,
  fcpMs: 1800,
  tbtMs: 200,
  cls: 0.1,
  jsBytes: 360 * 1024,
} as const;

type PsiResult = {
  lighthouseResult?: {
    categories?: { performance?: { score?: number } };
    audits?: Record<string, { numericValue?: number; details?: { items?: Array<{ resourceType?: string; transferSize?: number }> } }>;
  };
};

export class LighthouseQuotaExceededError extends Error {
  readonly retryAt: Date;

  constructor(message: string, retryAt = new Date(Date.now() + 24 * 60 * 60 * 1000)) {
    super(message);
    this.name = "LighthouseQuotaExceededError";
    this.retryAt = retryAt;
  }
}

export function isLighthouseQuotaError(error: unknown): error is LighthouseQuotaExceededError {
  return error instanceof LighthouseQuotaExceededError;
}

function isQuotaMessage(message: string) {
  return /quota exceeded|queries per day|rate limit|RESOURCE_EXHAUSTED/i.test(message);
}

export type LighthouseAudit = {
  url: string;
  performanceScore: number;
  lcpMs: number;
  fcpMs: number;
  tbtMs: number;
  cls: number;
  jsBytes: number;
  budgetExceeded: string[];
};

export function parseAudit(payload: PsiResult, url: string): LighthouseAudit {
  const result = payload.lighthouseResult;
  const audits = result?.audits ?? {};
  const performanceScore = Math.round((result?.categories?.performance?.score ?? 0) * 100);
  const lcpMs = audits["largest-contentful-paint"]?.numericValue ?? 0;
  const fcpMs = audits["first-contentful-paint"]?.numericValue ?? 0;
  const tbtMs = audits["total-blocking-time"]?.numericValue ?? 0;
  const cls = audits["cumulative-layout-shift"]?.numericValue ?? 0;
  const jsBytes = (audits["resource-summary"]?.details?.items ?? [])
    .filter(item => item.resourceType === "Script")
    .reduce((total, item) => total + (item.transferSize ?? 0), 0);
  const budgetExceeded = [
    ...(lcpMs > LIGHTHOUSE_BUDGET.lcpMs ? [`LCP ${Math.round(lcpMs)}ms > ${LIGHTHOUSE_BUDGET.lcpMs}ms`] : []),
    ...(fcpMs > LIGHTHOUSE_BUDGET.fcpMs ? [`FCP ${Math.round(fcpMs)}ms > ${LIGHTHOUSE_BUDGET.fcpMs}ms`] : []),
    ...(tbtMs > LIGHTHOUSE_BUDGET.tbtMs ? [`TBT ${Math.round(tbtMs)}ms > ${LIGHTHOUSE_BUDGET.tbtMs}ms`] : []),
    ...(cls > LIGHTHOUSE_BUDGET.cls ? [`CLS ${cls.toFixed(3)} > ${LIGHTHOUSE_BUDGET.cls}`] : []),
    ...(jsBytes > LIGHTHOUSE_BUDGET.jsBytes ? [`JS ${Math.round(jsBytes / 1024)}KB > ${Math.round(LIGHTHOUSE_BUDGET.jsBytes / 1024)}KB`] : []),
  ];
  return { url, performanceScore, lcpMs, fcpMs, tbtMs, cls, jsBytes, budgetExceeded };
}

export async function runLighthouseAudit(): Promise<LighthouseAudit> {
  const params = new URLSearchParams({ url: TARGET_URL, strategy: "mobile", category: "performance" });
  const response = await fetch(`${PSI_ENDPOINT}?${params}`, { signal: AbortSignal.timeout(120_000) });
  const payload = await response.json() as PsiResult & { error?: { message?: string } };
  if (!response.ok) {
    const message = payload.error?.message || `PageSpeed Insights failed (${response.status})`;
    if (response.status === 429 || isQuotaMessage(message)) throw new LighthouseQuotaExceededError(message);
    throw new Error(message);
  }
  return parseAudit(payload, TARGET_URL);
}

function formatAudit(audit: LighthouseAudit) {
  return `Performance ${audit.performanceScore}점 · LCP ${Math.round(audit.lcpMs)}ms · FCP ${Math.round(audit.fcpMs)}ms · TBT ${Math.round(audit.tbtMs)}ms · CLS ${audit.cls.toFixed(3)} · JS ${Math.round(audit.jsBytes / 1024)}KB`;
}

export async function executeLighthouseAudit() {
  const previousRun = await db.getLatestSyncRun("lighthouse");
  const previousDetail = previousRun?.detail ?? "";
  const retryAtMatch = previousDetail.match(/quota_retry_at=([^} ;]+)/);
  const retryAt = retryAtMatch ? new Date(retryAtMatch[1]) : undefined;
  const runId = await db.startSyncRun("lighthouse");
  if (retryAt && !Number.isNaN(retryAt.getTime()) && retryAt.getTime() > Date.now()) {
    const detail = `quota_exceeded; quota_retry_at=${retryAt.toISOString()}; 이전 쿼터 초과 backoff 기간입니다.`;
    await db.finishSyncRun(runId, "success", 0, detail);
    return { skipped: "quota_exceeded" as const, retryAt };
  }
  try {
    const audit = await runLighthouseAudit();
    const detail = JSON.stringify({ ...audit, measuredAt: new Date().toISOString() });
    await db.finishSyncRun(runId, "success", audit.performanceScore, detail);
    await db.markScheduleCompleted("lighthouse");
    if (audit.budgetExceeded.length > 0) {
      await notifyOwner({
        title: "가신 Lighthouse 성능 예산 초과",
        content: `${formatAudit(audit)}\n초과 항목: ${audit.budgetExceeded.join(", ")}`,
      });
    }
    return audit;
  } catch (error) {
    if (isLighthouseQuotaError(error)) {
      const detail = `quota_exceeded; quota_retry_at=${error.retryAt.toISOString()}; ${error.message}`;
      await db.finishSyncRun(runId, "success", 0, detail);
      return { skipped: "quota_exceeded" as const, retryAt: error.retryAt };
    }
    const detail = error instanceof Error ? error.message : "Lighthouse 측정 실패";
    await db.finishSyncRun(runId, "failed", 0, detail);
    await notifyOwner({ title: "가신 Lighthouse 측정 실패", content: detail });
    throw error;
  }
}

export function registerLighthouseAuditRoute(app: Express) {
  app.post("/api/scheduled/lighthouse", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron) return res.status(403).json({ error: "cron-only" });
      const audit = await executeLighthouseAudit();
      res.json({ ok: true, audit, ...("skipped" in audit ? { message: "PageSpeed API 쿼터 초과 backoff 중이며 다음 재시도 시각까지 외부 호출을 건너뜁니다." } : {}) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Lighthouse scheduled audit failed";
      console.error("[Lighthouse] scheduled audit failed", error);
      res.status(500).json({ error: message, timestamp: new Date().toISOString() });
    }
  });
}
