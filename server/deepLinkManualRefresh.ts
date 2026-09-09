import * as db from "./db";
import { searchCatalogSafely } from "./catalogSearch";
import { generatePendingDeepLinkForProduct } from "./deepLinks";

export type ManualDeepLinkRefreshStatus = "ready" | "collector_verified" | "not_found" | "rate_limited" | "pending";

export type ManualDeepLinkRefreshResult = {
  status: ManualDeepLinkRefreshStatus;
  message: string;
};

function hasRecentCollectorVerifiedExactPurchasePath(product: Awaited<ReturnType<typeof db.getProductById>>, now = new Date()) {
  if (!product || !product.inStock || !product.affiliateUrl || !product.wowMemberPrice || !product.wowMemberPriceObservedAt) return false;
  if (product.wowMemberPriceObservedAt.getTime() < now.getTime() - 7 * 24 * 60 * 60 * 1000) return false;
  const [productId, itemId, vendorItemId] = product.externalProductId.split(":");
  if (!productId || !itemId || !vendorItemId) return false;
  try {
    const url = new URL(product.affiliateUrl);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:"
      && ["coupang.com", "www.coupang.com", "m.coupang.com"].includes(host)
      && url.pathname.includes(`/vp/products/${productId}`)
      && url.searchParams.get("itemId") === itemId
      && url.searchParams.get("vendorItemId") === vendorItemId;
  } catch {
    return false;
  }
}

/**
 * 관리자가 요청한 단건 재생성입니다. 상품명과 유사한 다른 옵션은 절대 사용하지 않고,
 * productId·itemId·vendorItemId로 구성된 기존 externalProductId가 정확히 일치할 때만 진행합니다.
 */
export async function refreshDeepLinkForExactSku(productId: number): Promise<ManualDeepLinkRefreshResult> {
  const product = await db.getProductById(productId);
  if (!product || !product.isActive || !product.inStock) throw new Error("활성 재고 상품만 딥링크를 갱신할 수 있습니다.");

  const result = await searchCatalogSafely(product.name.trim().slice(0, 50), 10, {
    forceExternal: true,
    callType: "price-tracking",
  });
  if (result.source === "rate_limited") {
    return {
      status: "rate_limited",
      message: `쿠팡 API 보호 모드입니다. ${result.retryAt ? `${result.retryAt.toLocaleString("ko-KR")} 이후` : "잠시 후"} 다시 시도해 주세요.`,
    };
  }

  const exactMatch = result.products.some(candidate => candidate.externalProductId === product.externalProductId);
  if (!exactMatch) {
    const outcome = await db.recordDeferredSearchRecheckMiss(
      product.id,
      "관리자 딥링크 갱신 요청에서 productId·itemId·vendorItemId가 모두 일치하는 옵션 SKU를 찾지 못했습니다."
    );
    if (outcome === "collector_trusted") {
      const generation = await generatePendingDeepLinkForProduct(product.id);
      const saved = await db.getProductById(product.id);
      if (saved?.deepLinkStatus === "ready" && saved.deepLinkUrl) {
        return { status: "ready", message: "공식 검색 결과에는 없지만 최근 수집기 관측을 신뢰해 정확 SKU 딥링크를 유지했습니다." };
      }
      if (hasRecentCollectorVerifiedExactPurchasePath(saved)) {
        return { status: "collector_verified", message: "파트너스 API 결과에는 없지만 최근 수집기 관측을 신뢰해 정확 SKU의 원본 쿠팡 상품 경로를 유지합니다. 제휴 딥링크는 생성 대기 중입니다." };
      }
      return { status: "pending", message: generation.detail || "최근 수집기 관측을 신뢰해 정확 SKU 딥링크 생성을 다시 요청했습니다." };
    }
    return {
      status: "not_found",
      message: "쿠팡 공식 결과에서 같은 옵션 SKU를 찾지 못해 기존 링크를 숨겼습니다. 다른 옵션으로 연결하지 않습니다.",
    };
  }

  const refreshed = await db.getProductById(product.id);
  if (refreshed?.deepLinkStatus === "ready" && refreshed.deepLinkUrl) {
    return { status: "ready", message: "쿠팡 공식 응답의 최신 링크로 갱신했습니다." };
  }

  const generation = await generatePendingDeepLinkForProduct(product.id);
  const saved = await db.getProductById(product.id);
  if (saved?.deepLinkStatus === "ready" && saved.deepLinkUrl) {
    return { status: "ready", message: "정확 SKU를 확인하고 새 딥링크를 생성했습니다." };
  }
  return {
    status: "pending",
    message: generation.detail || "정확 SKU는 확인됐지만 딥링크 생성이 아직 완료되지 않았습니다.",
  };
}
