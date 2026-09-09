import * as db from "./db";
import { checkAndSendExtensionPriceAlerts } from "./priceAlertService";

let metadataSyncInFlight = false;

export async function syncCollectedPriceDataForAdmin() {
  const runId = await db.startSyncRun("collection");
  try {
    const result = await db.syncLatestCollectedPricesToTrackedProducts();
    const alerts = await checkAndSendExtensionPriceAlerts(result.updatedProducts.map(product => product.id));
    const detail = `최신 관측 ${result.observedCount}개 · 반영 ${result.updatedCount}개 · 같은 가격 ${result.unchangedCount}개 · 이전 시각 ${result.staleCount}개 · 미연결 SKU ${result.unmatchedCount}개 · 잘못된 가격 ${result.invalidCount}개`;
    await db.finishSyncRun(runId, "success", result.updatedCount, detail);
    return { ...result, alerts, detail, syncedAt: new Date() };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "수집 데이터 동기화 오류";
    await db.finishSyncRun(runId, "failed", 0, detail);
    throw error;
  }
}

export async function syncCollectorMetadataForAdmin() {
  if (metadataSyncInFlight) return { status: "already_running" as const, observedCount: 0, matchedCount: 0, updatedCount: 0, unchangedCount: 0, unmatchedCount: 0, updatedProductIds: [], detail: "이미 옵션 메타 동기화가 실행 중입니다." };
  metadataSyncInFlight = true;
  try {
    const result = await db.syncCollectorMetadataForAdmin();
    return { status: "completed" as const, ...result, detail: `수집 관측 ${result.observedCount}개 · 대상 매칭 ${result.matchedCount}개 · 옵션 보완 ${result.updatedCount}개 · 이미 최신 ${result.unchangedCount}개 · 미연결 ${result.unmatchedCount}개` };
  } finally {
    metadataSyncInFlight = false;
  }
}
