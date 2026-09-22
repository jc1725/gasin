import type { Express, Request, Response } from "express";
import * as db from "./db";
import { COUPANG_BEST_CATEGORY_IDS, getBestCategoryProducts, getCoupangVariantKey, getGoldBoxProducts } from "./coupang";
import { searchCatalogSafely } from "./catalogSearch";
import { generatePendingDeepLinks } from "./deepLinks";
import { buildPriceRefreshSearchKeyword } from "./priceRefreshSearchQuery";
import { findSkuWithFallbackQueries } from "./multiStageSkuMatcher";
import { CoupangRateLimitError } from "./coupangRateLimit";
import { GoogleDriveTokenDecryptionError, syncProductsToPersonalGoogleDrive } from "./googleDrivePersonal";
import { sdk } from "./_core/sdk";
import { isExcludedTrackingCategory } from "./categoryEligibility";
import { logError, logInfo } from "./_core/log";

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
  let connectionUserId: number | null = null;
  try {
    const connection = await db.getGoogleDriveSnapshotConnection();
    if (!connection) {
      const detail = "개인 Google Drive 백업 연결 대기 중";
      await db.finishSyncRun(runId, "success", 0, detail);
      return detail;
    }
    connectionUserId = connection.userId;
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
    console.error("[Google Drive sync]", error);
    // 2026-09-19: 토큰 복호화 실패(JWT_SECRET 변경 등)는 재시도해도 절대 성공하지
    // 않는 영구 오류다. 이걸 구분하지 않으면 3분마다 도는 자동 동기화가 매번 같은
    // 실패를 반복하며 에러 로그만 쌓인다. 복호화 실패로 확인되면 연결을 끊어서
    // 다음부터는 "연결 대기 중"으로 조용히 표시되게 하고, 사용자가 설정에서
    // Google Drive를 다시 연결하면 saveGoogleDriveConnection이 새 암호문으로
    // 덮어써 자동으로 복구된다.
    if (error instanceof GoogleDriveTokenDecryptionError && connectionUserId !== null) {
      await db.deleteGoogleDriveConnection(connectionUserId);
      const detail = "Google Drive 연결이 만료되어 자동 백업을 해제했습니다. 설정에서 Google Drive를 다시 연결해 주세요.";
      await db.finishSyncRun(runId, "failed", 0, detail);
      return detail;
    }
    const message = error instanceof Error ? error.message : "알 수 없는 Google Drive 동기화 오류";
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
    // 2026-09-18: 골드박스는 하루 1번 전체가 갱신되므로, 이번에 실제로 저장된 목록에
    // 없는 예전 골드박스 상품은 화면에서 내린다(isActive: false) — 어제 목록이 오늘
    // 목록과 섞여 보이는 걸 막는다.
    const staleCleanup = await db.deactivateStaleProductsForSource("goldbox", saved.map(product => product.externalProductId));
    const deepLinkBatch = await generatePendingDeepLinks();
    const activatedManualLinks = await db.activateManualTracksForKnownProducts();
    const driveSnapshot = await syncProductSnapshotToDrive();
    await db.markScheduleCompleted("goldbox");
    return { processedCount: saved.length, detail: `GoldBox 상품을 갱신했습니다. 이전 골드박스 상품 ${staleCleanup.deactivatedCount}개는 이번 목록에 없어 화면에서 내렸습니다. ${deepLinkBatch.detail}. 수동 대기 링크 ${activatedManualLinks}개를 활성화했습니다. ${driveSnapshot}.` } satisfies JobOutcome;
  });
}

// ============================================================
// 골드박스 매일 오전 8시(KST) 자동 갱신
// ------------------------------------------------------------
// 2026-09-18: cron-job.org가 /api/external/price-refresh를 약 3분 간격으로 안정적으로
// 호출하고 있는 것을 확인해(Railway 로그로 검증), 별도의 새 외부 크론을 추가로 설정할
// 필요 없이 그 3분 heartbeat에 얹어서 게이팅한다 — 실제 실행은 이 함수가 시각·직전
// 결과를 보고 스스로 결정하므로, 3분마다 불려도 대부분은 조건 미충족으로 즉시
// 반환된다(사실상 no-op).
//
// 정책: 매일 KST 08:00 이후 처음 호출될 때 실행. 성공하면 markScheduleCompleted로
// 기록되고(collectGoldBoxProducts 내부), 그날은 08:00 이후 syncRuns에 success 기록이
// 있으므로 다시 실행하지 않는다. 실패하면 다음 호출(최대 3분 뒤) 때 재시도한다.
// ============================================================
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const GOLDBOX_DAILY_RUN_HOUR_KST = 8; // 오전 8시
const GOLDBOX_RETRY_AFTER_FAILURE_MS = 3 * 60 * 1000; // 3분

function kstWallClock(date: Date) {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    hour: shifted.getUTCHours(),
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

/** 오늘(KST) GOLDBOX_DAILY_RUN_HOUR_KST 시각에 해당하는 실제 UTC Date 인스턴트. */
function todayGoldBoxThresholdUtc(now: Date) {
  const { year, month, day } = kstWallClock(now);
  const thresholdAsIfUtc = Date.UTC(year, month, day, GOLDBOX_DAILY_RUN_HOUR_KST, 0, 0, 0);
  return new Date(thresholdAsIfUtc - KST_OFFSET_MS);
}

export async function runGoldBoxDailySchedule(now: Date = new Date()) {
  const { hour } = kstWallClock(now);
  if (hour < GOLDBOX_DAILY_RUN_HOUR_KST) {
    return { ran: false, reason: "오전 8시 전이라 대기" } as const;
  }

  const threshold = todayGoldBoxThresholdUtc(now);
  const lastRun = await db.getLatestSyncRun("goldbox");

  if (lastRun && lastRun.status === "success" && lastRun.startedAt >= threshold) {
    return { ran: false, reason: "오늘 이미 성공적으로 갱신함" } as const;
  }
  if (lastRun && lastRun.status === "failed" && lastRun.startedAt >= threshold) {
    const elapsedSinceFailure = now.getTime() - lastRun.startedAt.getTime();
    if (elapsedSinceFailure < GOLDBOX_RETRY_AFTER_FAILURE_MS) {
      return { ran: false, reason: "직전 실패 후 3분 재시도 대기 중" } as const;
    }
  }
  // status === "running"인 경우(다른 호출이 지금 처리 중)는 runTrackedJob이 별도로
  // 동시성을 막지 않으므로, 여기서는 그냥 다시 시도한다 — collectGoldBoxProducts
  // 자체가 멱등적(같은 상품을 다시 upsert)이라 안전하다.

  try {
    const result = await collectGoldBoxProducts();
    return { ran: true, result } as const;
  } catch (error) {
    logError("goldbox_daily_schedule_failed", "external_cron", error, { endpoint: "goldbox-daily" });
    return { ran: true, error: error instanceof Error ? error.message : "Unknown error" } as const;
  }
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
    // 2026-09-22: "이관되면 기존내용은 숨김 처리하고, 90일 지나면 삭제할것" — SKU 이관·
    // 관리자 병합·골드박스 탈락으로 90일 넘게 비활성 상태인 상품도 이 90일 보존 정책에
    // 같이 태운다(deleteExpiredInactiveProducts, server/db.ts).
    const { deletedCount: supersededDeleted } = await db.deleteExpiredInactiveProducts(expiry);
    await db.markScheduleCompleted("retention");
    return {
      processedCount: officialDeleted + collectedDeleted + supersededDeleted,
      detail: `90일 이전 가격 이력 ${officialDeleted}건과 외부 수집 이력 ${collectedDeleted}건, 이관·병합·골드박스 탈락으로 90일 넘게 비활성 상태인 상품 ${supersededDeleted}개를 정리했습니다.`,
    } satisfies JobOutcome;
  });
}

// ============================================================
// 90일 지난 비활성 상품 + 오래된 가격 이력 정리(retention) — 매일 1회 게이팅 실행
// ------------------------------------------------------------
// 2026-09-22: /api/scheduled/retention이 cron-job.org 등 외부 트리거에 실제로 연결돼
// 있는지 Railway HTTP 로그로 확인되지 않았다(연결이 안 돼 있으면 이 정리가 영원히
// 실행되지 않는다). 골드박스 일일 갱신과 같은 이유로, 이미 3분마다 안정적으로 호출되는
// 것이 확인된 /api/external/price-refresh heartbeat에 얹어서 하루 한 번만 게이팅
// 실행한다 — 새 외부 크론 설정 없이도 확실히 돈다.
// ============================================================
const RETENTION_RUN_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24시간
const RETENTION_RETRY_AFTER_FAILURE_MS = 3 * 60 * 1000; // 3분

export async function runRetentionDailySchedule(now: Date = new Date()) {
  const lastRun = await db.getLatestSyncRun("retention");
  if (lastRun && lastRun.status === "success" && now.getTime() - lastRun.startedAt.getTime() < RETENTION_RUN_INTERVAL_MS) {
    return { ran: false, reason: "24시간 이내 이미 성공적으로 정리함" } as const;
  }
  if (lastRun && lastRun.status === "failed" && now.getTime() - lastRun.startedAt.getTime() < RETENTION_RETRY_AFTER_FAILURE_MS) {
    return { ran: false, reason: "직전 실패 후 3분 재시도 대기 중" } as const;
  }
  try {
    const result = await removeExpiredPriceHistory();
    return { ran: true, result } as const;
  } catch (error) {
    logError("retention_daily_schedule_failed", "external_cron", error, { endpoint: "retention-daily" });
    return { ran: true, error: error instanceof Error ? error.message : "Unknown error" } as const;
  }
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

// 2026-09-18: 구조화 로그 적용 — runTrackedJob()이 이미 syncRuns 테이블에 성공/실패를
// 기록하지만, 그 호출이 "스케줄러가 호출했는지" 아니면 같은 로직을 관리자가 수동으로
// 트리거했는지는 구분하지 않는다(예: refreshGoldBox 관리자 수동 버튼도 같은 collectGoldBoxProducts를
// 호출). syncRuns에 트리거 출처 컬럼을 추가하는 스키마 변경은 이번엔 범위를 벗어나 보류하고,
// 대신 route: "scheduler" 태그를 단 로그로 Railway 로그 뷰에서 이 경로만 필터링할 수 있게 한다.
function createHandler(jobKey: JobKey, action: () => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      if (!(await authorizeJob(req, res, jobKey))) return;
      logInfo("scheduled_job_start", "scheduler", { jobKey });
      const result = await action();
      logInfo("scheduled_job_success", "scheduler", { jobKey, durationMs: Date.now() - startedAt });
      res.json({ ok: true, result });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown scheduled job error";
      logError("scheduled_job_failed", "scheduler", error, { jobKey, durationMs: Date.now() - startedAt });
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
