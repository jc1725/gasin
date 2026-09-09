import { createCoupangDeepLinks } from "./coupang";
import * as db from "./db";
import { CoupangRateLimitError } from "./coupangRateLimit";

export type DeepLinkBatchResult = { processedCount: number; skipped?: boolean; detail: string };
type PendingDeepLinkProduct = { id: number; affiliateUrl: string };

function isStoredCoupangAffiliateUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.toLowerCase() === "link.coupang.com";
  } catch {
    return false;
  }
}

function isSupportedDirectCoupangUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && ["coupang.com", "www.coupang.com", "m.coupang.com"].includes(host);
  } catch {
    return false;
  }
}

async function generateDeepLinksForProducts(pending: PendingDeepLinkProduct[]): Promise<DeepLinkBatchResult> {
  const globalQuota = await db.getCoupangApiRateLimitStatus();
  if (!globalQuota.allowed) {
    await db.recordCoupangRateLimitEvent("deeplink", globalQuota.reason ?? "minute-limit", globalQuota.retryAt);
    return { processedCount: 0, skipped: true, detail: `쿠팡 전역 API 보호 모드(${globalQuota.reason ?? "minute-limit"}): ${globalQuota.retryAt?.toISOString() ?? "해제 시각 미정"} 이후 딥링크 생성 재개` };
  }
  const quota = await db.getSearchApiQuotaStatus();
  if (!quota.allowed && quota.reason === "emergency-block") {
    return { processedCount: 0, skipped: true, detail: `쿠팡 API 보호 모드: ${quota.retryAt?.toISOString() ?? "해제 시각 미정"} 이후 딥링크 생성 재개` };
  }
  if (pending.length === 0) return { processedCount: 0, detail: "생성 대기 딥링크 없음" };

  const reusable = pending.filter(product => isStoredCoupangAffiliateUrl(product.affiliateUrl));
  const invalid = pending.filter(product => !isStoredCoupangAffiliateUrl(product.affiliateUrl) && !isSupportedDirectCoupangUrl(product.affiliateUrl));
  const direct = pending.filter(product => isSupportedDirectCoupangUrl(product.affiliateUrl));
  for (const product of reusable) await db.saveDeepLinkForProduct(product.id, product.affiliateUrl);
  for (const product of invalid) await db.saveDeepLinkForProduct(product.id, null, "원본 URL 문제: 수집·저장된 주소가 지원되는 쿠팡 상품 URL이 아닙니다.");

  let ready = reusable.length;
  let failed = invalid.length;
  for (const product of direct) {
    let deepLinkUrl: string | null = null;
    try {
      const generated = await createCoupangDeepLinks([product.affiliateUrl]);
      const generatedLink = generated.find(link => link.originUrl === product.affiliateUrl) ?? (generated.length === 1 ? generated[0] : undefined);
      deepLinkUrl = generatedLink?.shortenUrl ?? generatedLink?.landingUrl ?? null;
    } catch (error) {
      if (error instanceof CoupangRateLimitError) {
        await db.recordCoupangRateLimitEvent("deeplink", error.reason, error.retryAt);
        return { processedCount: ready, skipped: true, detail: `쿠팡 전역 API 보호 모드(${error.reason}): ${error.retryAt.toISOString()} 이후 딥링크 생성 재개` };
      }
      const reason = error instanceof Error ? error.message : "알 수 없는 딥링크 변환 오류";
      await db.saveDeepLinkForProduct(product.id, null, `쿠팡 딥링크 변환 실패: ${reason}`);
      failed += 1;
      continue;
    }

    await db.saveDeepLinkForProduct(
      product.id,
      deepLinkUrl,
      deepLinkUrl ? null : "쿠팡 딥링크 생성 결과가 없습니다. 정확 SKU가 포함된 원본 URL을 수집기에서 다시 확인해 주세요."
    );
    if (deepLinkUrl) ready += 1;
    else failed += 1;
  }
  const invalidDetail = invalid.length > 0 ? `지원하지 않는 URL ${invalid.length}개는 외부 호출 없이 실패 처리했습니다.` : "지원하지 않는 URL은 없습니다.";
  const failedDetail = failed > 0 ? `딥링크 생성 실패 ${failed}개는 해당 상품만 재시도 대기로 남겼습니다.` : "딥링크 생성 실패 상품은 없습니다.";
  return { processedCount: ready, detail: `옵션 SKU ${pending.length}개 중 ${ready}개의 딥링크를 저장했습니다. 기존 제휴 링크 ${reusable.length}개를 재사용했습니다. ${invalidDetail} ${failedDetail}` };
}

export async function generatePendingDeepLinks(): Promise<DeepLinkBatchResult> {
  return generateDeepLinksForProducts(await db.listPendingDeepLinkProducts(20));
}

/** 유효한 확장 수집 관측으로 확인된 정확 SKU만 즉시 처리한다. */
export async function generatePendingDeepLinksForProductIds(productIds: number[]): Promise<DeepLinkBatchResult> {
  return generateDeepLinksForProducts(await db.listPendingDeepLinkProductsByIds(productIds));
}

/** 관리자 수동 갱신은 다른 대기 상품을 함께 처리하지 않고, 정확 SKU가 재확인된 한 상품만 생성한다. */
export async function generatePendingDeepLinkForProduct(productId: number): Promise<DeepLinkBatchResult> {
  const product = await db.getProductById(productId);
  if (!product) return { processedCount: 0, skipped: true, detail: "상품을 찾을 수 없습니다." };
  if (product.deepLinkStatus === "ready" && product.deepLinkUrl) return { processedCount: 0, detail: "이미 확인된 딥링크가 있습니다." };
  if (product.deepLinkStatus !== "pending") return { processedCount: 0, skipped: true, detail: "정확 SKU 재확인 후에만 새 딥링크를 생성할 수 있습니다." };
  return generateDeepLinksForProducts([{ id: product.id, affiliateUrl: product.affiliateUrl }]);
}
