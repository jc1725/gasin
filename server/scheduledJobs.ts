import type { Express, Request, Response } from "express";
import * as db from "./db";
import { COUPANG_BEST_CATEGORY_IDS, getBestCategoryProducts, getCoupangVariantKey, getGoldBoxProducts } from "./coupang";
import { searchCatalogSafely } from "./catalogSearch";
import { generatePendingDeepLinks } from "./deepLinks";
import { buildPriceRefreshSearchKeyword } from "./priceRefreshSearchQuery";
import { findSkuWithFallbackQueries } from "./multiStageSkuMatcher";
import { CoupangRateLimitError } from "./coupangRateLimit";
import { syncProductsToPersonalGoogleDrive } from "./googleDrivePersonal";
import { sdk } from "./_core/sdk";
import { isExcludedTrackingCategory } from "./categoryEligibility";

type JobKey = "goldbox" | "bestcategory" | "price" | "retention";
type JobOutcome = { processedCount: number; detail?: string; skipped?: boolean };
type ManualLinkProcessOutcome = { summary: string; detail?: string };
export function selectPrioritizedGoldBoxKeys<T extends { source: db.ProductSource; trackingPriority: "high" | "normal" | "low"; lastSeenAt: Date; lastViewedAt: Date | null; externalProductId: string }>(tracked: T[], limit = 30) {
  return tracked
    .filter(product => product.source === "goldbox")
    .sort((left, right) => left.lastSeenAt.getTime() - right.lastSeenAt.getTime() || left.externalProductId.localeCompare(right.externalProductId))
    .slice(0, limit)
    .map(product => product.externalProductId);
}

export function findUnmatchedGoldBoxKeys(selectedKeys: Set<string>, offers: Array<{ externalProductId: string }>) {
  const returnedKeys = new Set(offers.map(offer => offer.externalProductId));
  return Array.from(selectedKeys).filter(key => !returnedKeys.has(key));
}

export const MAX_DEFERRED_SEARCH_RECHECKS_PER_RUN = 24;
/**
 * 3분 Heartbeat 제한 안에서 안정적으로 종료하면서 가격 갱신 예산(추적용 32회/분)을 넘지
 * 않는 순차 배치 크기입니다. 상품당 최대 2회 호출(findSkuWithFallbackQueries)을 가정해도
 * 30개 배치는 최악의 경우 60회로 3분(최대 96회 예산) 안에 여유 있게 처리되며, 예산을
 * 넘어서면 coupangRateLimit이 보호 모드로 안전하게 중단·재시도하므로 초과 위험은 없습니다.
 */
export const PRICE_REFRESH_SEARCH_BATCH_SIZE = 30;

export async function recheckDeferredSearchProducts() {
  const candidates = await db.getDeferredSearchProducts(MAX_DEFERRED_SEARCH_RECHECKS_PER_RUN);
  if (candidates.length === 0) return "deferred 검색 상품 재확인 대상 없음";
  let refreshed = 0;
  let unmatched = 0;
  let collectorTrusted = 0;
  for (const candidate of candidates) {
    let result: Awaited<ReturnType<typeof searchCatalogSafely>>;
    try {
      result = await searchCatalogSafely(buildPriceRefreshSearchKeyword(candidate), 10, { forceExternal: true, callType: "price-tracking" });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "알 수 없는 Search API 오류";
      await db.recordDeferredSearchRecheckError(candidate.id, reason);
      continue;
    }
    if (result.source === "rate_limited") {
      return `deferred 검색 상품 ${candidates.length}개 중 ${refreshed + unmatched}개 처리 후 보호 모드로 보류: ${result.retryAt?.toISOString() ?? "해제 시각 미정"}`;
    }
    const exactMatch = result.source === "coupang" && result.products.some(product => product.externalProductId === candidate.externalProductId);
    if (exactMatch) {
      refreshed += 1;
      continue;
    }
    const outcome = await db.recordDeferredSearchRecheckMiss(candidate.id, "승인된 Search API 결과에서 productId·itemId·vendorItemId가 모두 일치하는 옵션 SKU를 찾지 못했습니다. 다음 안전 조회 기회에 다시 확인합니다.");
    if (outcome === "collector_trusted") collectorTrusted += 1;
    else unmatched += 1;
  }
  return `deferred 검색 상품 ${candidates.length}개 재확인: fresh ${refreshed}개 · 수집기 관측 유지 ${collectorTrusted}개 · 정확 SKU 미일치 ${unmatched}개`;
}

async function recheckDeferredSearchProductsForPriceJob() {
  const candidates = await db.getDeferredSearchProducts(PRICE_REFRESH_SEARCH_BATCH_SIZE);
  if (candidates.length === 0) return { processedCount: 0, refreshedProducts: [], detail: "24시간 경과 검색 상품 재확인 대상 없음" };

  let attemptedCount = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;
  let collectorTrustedCount = 0;
  let apiErrorCount = 0;
  const refreshedProducts = [] as Awaited<ReturnType<typeof searchCatalogSafely>> extends { products: infer Products } ? Products extends Array<infer Product> ? Product[] : never : never;

  for (const candidate of candidates) {
    const metricStartedAt = Date.now();
    let apiCalls = 0;
    let match: Awaited<ReturnType<typeof findSkuWithFallbackQueries>>;
    try {
      match = await findSkuWithFallbackQueries(
        candidate,
        query => {
          apiCalls += 1;
          return searchCatalogSafely(query, 10, { forceExternal: true, callType: "price-tracking" });
        },
        productId => {
          apiCalls += 1;
          return searchCatalogSafely(productId, 10, { forceExternal: true, callType: "price-tracking" });
        },
      );
    } catch (error) {
      attemptedCount += 1;
      apiErrorCount += 1;
      const reason = error instanceof Error ? error.message : "알 수 없는 Search API 오류";
      console.error(`[Scheduled price] 상품 #${candidate.id} 재확인 보류: ${reason}`);
      await db.recordDeferredSearchRecheckError(candidate.id, reason);
      await db.recordPriceTrackingMetric({ productId: candidate.id, source: "search", outcome: "api_error", apiCalls, durationMs: Date.now() - metricStartedAt });
      continue;
    }
    if (match.rateLimited) {
      await db.recordPriceTrackingMetric({ productId: candidate.id, source: "search", outcome: "rate_limited", apiCalls, durationMs: Date.now() - metricStartedAt });
      return {
        processedCount: attemptedCount,
        refreshedProducts,
        skipped: true,
        detail: `검색 상품 ${candidates.length}개 중 ${attemptedCount}개 재확인 후 보호 모드: ${match.rateLimited.retryAt?.toISOString() ?? "해제 시각 미정"}`,
      };
    }

    attemptedCount += 1;
    if (match.exact) {
      matchedCount += 1;
      refreshedProducts.push(match.exact.product as typeof refreshedProducts[number]);
      await db.recordPriceTrackingMetric({ productId: candidate.id, source: "search", outcome: "matched", apiCalls, durationMs: Date.now() - metricStartedAt });
      continue;
    }

    const bestReason = match.best
      ? ` 가장 가까운 후보 점수 ${match.best.score}점(${match.best.reasons.join(", ")})였지만 정확 SKU는 달랐습니다.`
      : " 정확 SKU 후보가 반환되지 않았습니다.";
    const outcome = await db.recordDeferredSearchRecheckMiss(
      candidate.id,
      `승인된 Search API와 상품 ID 재조회(${match.queries.length}회)에서 productId·itemId·vendorItemId 전체가 일치하는 SKU를 찾지 못했습니다.${bestReason}`,
    );
    if (outcome === "collector_trusted") {
      collectorTrustedCount += 1;
      await db.recordPriceTrackingMetric({ productId: candidate.id, source: "search", outcome: "collector_resolved", apiCalls, durationMs: Date.now() - metricStartedAt });
    } else {
      unmatchedCount += 1;
      await db.recordPriceTrackingMetric({ productId: candidate.id, source: "search", outcome: "unmatched", apiCalls, durationMs: Date.now() - metricStartedAt });
    }
  }

  return {
    processedCount: attemptedCount,
    refreshedProducts,
    collectorTrustedCount,
    detail: `검색 상품 ${attemptedCount}개 재확인: fresh ${matchedCount}개 · 수집기 관측 유지 ${collectorTrustedCount}개 · 정확 SKU 미일치 ${unmatchedCount}개 · API 오류 재시도 대기 ${apiErrorCount}개`,
  };
}

export async function syncProductSnapshotToDrive() {
  const runId = await db.startSyncRun("drive");
  try {
    const connection = await db.getGoogleDriveSnapshotConnection();
    if (!connection) {
      const detail = "개인 Google Drive 백업 연결 대기 중";
      await db.finishSyncRun(runId, "success", 0, detail);
      return detail;
    }
    const products = await db.listAllTrackedProducts();
    const result = await syncProductsToPersonalGoogleDrive({
      refreshTokenCiphertext: connection.refreshTokenCiphertext,
      folderId: connection.folderId,
      snapshotFileId: connection.snapshotFileId,
      products,
    });
    await db.saveGoogleDriveSnapshotFile(connection.userId, result.fileId);
    const detail = `Google Drive 상품 스냅샷 ${products.length}개 ${result.action} (파일 ${result.fileId})`;
    await db.finishSyncRun(runId, "success", products.length, detail);
    return detail;
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 Google Drive 동기화 오류";
    console.error("[Google Drive sync]", error);
    const detail = `Google Drive 상품 스냅샷 동기화 보류: ${message}`;
    await db.finishSyncRun(runId, "failed", 0, detail);
    return detail;
  }
}

export async function processOneWaitingManualLink() {
  const waiting = await db.getNextWaitingManualLink();
  if (!waiting) return { summary: "수동 대기 링크 없음" } satisfies ManualLinkProcessOutcome;
  const pageKey = waiting.externalProductId.split(":")[0];
  const lookupKeyword = [waiting.queryKeyword?.trim(), waiting.optionLabel?.trim()].filter(Boolean).join(" ").slice(0, 120) || pageKey;
  const result = await searchCatalogSafely(lookupKeyword, 10, { callType: "price-tracking" });
  const activated = await db.activateManualTracksForKnownProducts();
  if (activated > 0) return { summary: `수동 링크 ${activated}개 활성화` } satisfies ManualLinkProcessOutcome;
  if (result.source === "rate_limited") {
    const nextRetryAt = result.retryAt ?? new Date(Date.now() + 8 * 60 * 1000);
    await db.setManualLinkWaitingError(waiting.id, `보호 모드로 재조회 보류: ${nextRetryAt.toISOString()}`, nextRetryAt);
    return { summary: "수동 링크 재조회 보호 모드", detail: `수동 링크 ${waiting.id}: 보호 모드로 ${nextRetryAt.toISOString()} 이후 재조회` } satisfies ManualLinkProcessOutcome;
  }
  const nextRetryAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  await db.setManualLinkWaitingError(
    waiting.id,
    "승인된 검색 결과에서 productId·itemId·vendorItemId가 모두 일치하는 옵션 SKU를 찾지 못했습니다. 다음 안전 조회 기회에 다시 시도합니다.",
    nextRetryAt
  );
  return {
    summary: "수동 링크 일치 상품 미발견",
    detail: `수동 링크 ${waiting.id}: productId·itemId·vendorItemId 정확 SKU 미일치. 다음 재조회 후보 ${nextRetryAt.toISOString()}`,
  } satisfies ManualLinkProcessOutcome;
}

async function runTrackedJob<T>(jobType: db.SyncJobType, work: () => Promise<T>) {
  const runId = await db.startSyncRun(jobType);
  try {
    const result = await work();
    const outcome = typeof result === "object" && result !== null && "processedCount" in result
      ? result as T & JobOutcome
      : null;
    const count = outcome?.processedCount ?? (Array.isArray(result) ? result.length : typeof result === "number" ? result : 0);
    await db.finishSyncRun(runId, "success", count, outcome?.detail);
    return result;
  } catch (error) {
    if (error instanceof CoupangRateLimitError) {
      const detail = `Coupang API 보호 모드: ${error.retryAt.toISOString()} 이후 재개. ${error.reason}`;
      await db.finishSyncRun(runId, "success", 0, detail);
      return { processedCount: 0, skipped: true, detail } as T;
    }
    const message = error instanceof Error ? error.message : "Unknown scheduled job error";
    await db.finishSyncRun(runId, "failed", 0, message);
    throw error;
  }
}

export async function collectGoldBoxProducts() {
  return runTrackedJob("goldbox", async () => {
    const quota = await db.getSearchApiQuotaStatus();
    if (!quota.allowed && quota.reason === "emergency-block") {
      return { processedCount: 0, skipped: true, detail: `Coupang API 보호 모드: ${quota.retryAt?.toISOString() ?? "해제 시각 미정"} 이후 재개` } satisfies JobOutcome;
    }
    const products = await getGoldBoxProducts();
    const saved = await db.upsertCoupangProducts(products, "goldbox");
    const deepLinkBatch = await generatePendingDeepLinks();
    const activatedManualLinks = await db.activateManualTracksForKnownProducts();
    const driveSnapshot = await syncProductSnapshotToDrive();
    await db.markScheduleCompleted("goldbox");
    return { processedCount: saved.length, detail: `GoldBox 상품을 갱신했습니다. ${deepLinkBatch.detail}. 수동 대기 링크 ${activatedManualLinks}개를 활성화했습니다. ${driveSnapshot}.` } satisfies JobOutcome;
  });
}

export async function collectBestCategoryProducts() {
  return runTrackedJob("bestcategory", async () => {
    const quota = await db.getSearchApiQuotaStatus();
    if (!quota.allowed && quota.reason === "emergency-block") {
      return { processedCount: 0, skipped: true, detail: `Coupang API 보호 모드: ${quota.retryAt?.toISOString() ?? "해제 시각 미정"} 이후 재개` } satisfies JobOutcome;
    }
    let savedCount = 0;
    let categoriesUpdated = 0;
    // 공식 19개 카테고리 요청은 전역 분당 46회 예산 내에서 3개씩 실행합니다.
    for (let index = 0; index < COUPANG_BEST_CATEGORY_IDS.length; index += 3) {
      const categoryIds = COUPANG_BEST_CATEGORY_IDS.slice(index, index + 3);
      const fetched = await Promise.all(categoryIds.map(async categoryId => ({ categoryId, offers: await getBestCategoryProducts(categoryId, 4) })));
      for (const { categoryId, offers } of fetched) {
        const saved = await db.upsertCoupangProducts(offers, "bestcategory");
        await db.replaceCategoryBestProducts(categoryId, saved.map(product => product.id));
        savedCount += saved.length;
        categoriesUpdated += 1;
      }
    }
    await db.markScheduleCompleted("bestcategory");
    return { processedCount: savedCount, detail: `공식 카테고리 베스트 ${categoriesUpdated}개 카테고리에서 ${savedCount}개 상품을 갱신했습니다. 실제 구매량 수치는 제공되지 않아 화면에는 카테고리 베스트로 표시합니다.` } satisfies JobOutcome;
  });
}

export async function refreshTrackedPrices() {
  return runTrackedJob("price", async () => {
    const tracked = (await db.listAllTrackedProducts()).filter(product => !isExcludedTrackingCategory({ categoryName: product.categoryName, name: product.name }));
    const prioritySummary = await db.getTrackingPrioritySummary();
    const searchTrackedProductIds = tracked.filter(product => product.source === "search").map(product => product.id);
    const searchTrackedCount = searchTrackedProductIds.length;
    const deferredSearchCount = await db.deferSearchProductRefresh(searchTrackedProductIds);
    const quota = await db.getSearchApiQuotaStatus();
    if (!quota.allowed && quota.reason === "emergency-block") {
      return { processedCount: 0, skipped: true, detail: `Coupang API 보호 모드: 고우선 ${prioritySummary.high}개·일반 ${prioritySummary.normal}개·저우선 ${prioritySummary.low}개 중 검색 등록 ${deferredSearchCount}개 및 GoldBox 가격 갱신을 ${quota.retryAt?.toISOString() ?? "해제 시각 미정"}까지 보류` } satisfies JobOutcome;
    }
    const goldboxKeys = new Set(selectPrioritizedGoldBoxKeys(tracked));
    const goldboxOffers = await getGoldBoxProducts();
    const matchingOffers = goldboxOffers.filter(offer => goldboxKeys.has(getCoupangVariantKey(offer)));
    const unmatchedKeys = findUnmatchedGoldBoxKeys(goldboxKeys, goldboxOffers.map(offer => ({ externalProductId: getCoupangVariantKey(offer) })));
    const refreshedProducts = await db.upsertCoupangProducts(matchingOffers, "goldbox");
    const deepLinkBatch = await generatePendingDeepLinks();
    const activatedManualLinks = await db.activateManualTracksForKnownProducts();
    const manualResolution = activatedManualLinks > 0
      ? { summary: `수동 링크 ${activatedManualLinks}개 활성화` } satisfies ManualLinkProcessOutcome
      : await processOneWaitingManualLink();
    const deferredSearchResolution = await recheckDeferredSearchProducts();
    const driveSnapshot = await syncProductSnapshotToDrive();
    await db.markScheduleCompleted("price");
    const unmatchedDetail = unmatchedKeys.length > 0
      ? `GoldBox 응답에 없는 옵션 SKU ${unmatchedKeys.length}개(${unmatchedKeys.slice(0, 3).join(", ")})는 다음 승인된 GoldBox 응답에서 재매칭하며 Search API로 강제 재조회하지 않았습니다.`
      : "선별한 옵션 SKU가 모두 GoldBox 응답에서 확인되었습니다.";
    return { processedCount: matchingOffers.length, detail: `GoldBox 승인 API로 가장 오래 확인되지 않은 추적 상품 ${matchingOffers.length}개를 갱신했습니다. 공식 API 기본가는 표시용이며 알림에는 사용하지 않습니다. ${unmatchedDetail} ${deepLinkBatch.detail}. ${manualResolution.detail ?? manualResolution.summary}. ${deferredSearchResolution}. ${driveSnapshot}. 검색 등록 ${deferredSearchCount}개는 안전한 Search API 예산을 위해 일괄 재조회하지 않았습니다.` } satisfies JobOutcome;
  });
}

/** 3분 가격 갱신 예약 작업: 상품별 오류를 격리해 제한 시간 안에 종료합니다. */
export async function refreshDeferredSearchPrices() {
  return runTrackedJob("price", async () => {
    const tracked = (await db.listAllTrackedProducts()).filter(product => !isExcludedTrackingCategory({ categoryName: product.categoryName, name: product.name }));
    const searchTrackedProductIds = tracked.filter(product => product.source === "search").map(product => product.id);
    const deferredSearchCount = await db.deferSearchProductRefresh(searchTrackedProductIds);
    const quota = await db.getSearchApiQuotaStatus();
    if (!quota.allowed && quota.reason === "emergency-block") {
      return { processedCount: 0, skipped: true, detail: `Coupang API 보호 모드: 검색 등록 ${deferredSearchCount}개를 ${quota.retryAt?.toISOString() ?? "해제 시각 미정"}까지 보류` } satisfies JobOutcome;
    }
    const outcome = await recheckDeferredSearchProductsForPriceJob();
    // 정확 SKU가 공식 결과에서 다시 확인되어 pending으로 전환된 경우에만 새 링크를 생성한다.
    // 실패했던 URL을 재사용하지 않고, 이번 공식 응답의 최신 상품 URL만 사용한다.
    const deepLinkBatch = outcome.refreshedProducts.length > 0 || (outcome.collectorTrustedCount ?? 0) > 0
      ? await generatePendingDeepLinks()
      : { processedCount: 0, detail: "정확 SKU 재확인·수집기 관측 유지 상품이 없어 딥링크 재생성을 건너뛰었습니다." };
    await db.markScheduleCompleted("price");
    return {
      processedCount: outcome.processedCount,
      skipped: outcome.skipped,
      detail: `${outcome.detail}. ${deepLinkBatch.detail}. 공식 API 기본가는 표시용이며 알림에는 사용하지 않습니다. 검색 등록 ${searchTrackedProductIds.length}개 중 마지막 확인이 24시간 지난 상품을 오래된 순으로 최대 ${PRICE_REFRESH_SEARCH_BATCH_SIZE}개 처리합니다.`,
    } satisfies JobOutcome;
  });
}

export async function removeExpiredPriceHistory() {
  return runTrackedJob("retention", async () => {
    const expiry = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const officialDeleted = await db.prunePriceHistory(expiry);
    const collectedDeleted = await db.pruneCollectedPriceHistory(expiry);
    await db.markScheduleCompleted("retention");
    return { processedCount: officialDeleted + collectedDeleted, detail: `90일 이전 가격 이력 ${officialDeleted}건과 외부 수집 이력 ${collectedDeleted}건을 정리했습니다.` } satisfies JobOutcome;
  });
}

async function authorizeJob(req: Request, res: Response, jobKey: JobKey) {
  const user = await sdk.authenticateRequest(req);
  if (!user.isCron || !user.taskUid) {
    res.status(403).json({ error: "cron-only" });
    return false;
  }
  const configuredJob = await db.getScheduleByTaskUid(user.taskUid);
  if (!configuredJob) {
    res.json({ ok: true, skipped: "orphan" });
    return false;
  }
  if (configuredJob.jobKey !== jobKey) {
    res.status(403).json({ error: "scheduled job mismatch" });
    return false;
  }
  return true;
}

function createHandler(jobKey: JobKey, action: () => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      if (!(await authorizeJob(req, res, jobKey))) return;
      const result = await action();
      res.json({ ok: true, result });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown scheduled job error";
      console.error(`[Scheduled ${jobKey}]`, error);
      res.status(500).json({
        error: detail,
        context: { jobKey, url: req.originalUrl },
        timestamp: new Date().toISOString(),
      });
    }
  };
}

export function registerScheduledJobRoutes(app: Express) {
  app.post("/api/scheduled/goldbox", createHandler("goldbox", collectGoldBoxProducts));
  app.post("/api/scheduled/bestcategory", createHandler("bestcategory", collectBestCategoryProducts));
  app.post("/api/scheduled/price", createHandler("price", refreshDeferredSearchPrices));
  app.post("/api/scheduled/retention", createHandler("retention", removeExpiredPriceHistory));
}
