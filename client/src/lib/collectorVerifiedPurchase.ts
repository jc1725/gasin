const TRUST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type CollectorVerifiedProduct = {
  externalProductId: string;
  affiliateUrl: string | null;
  inStock: boolean;
  wowMemberPrice: number | null;
  wowMemberPriceObservedAt: Date | string | null;
};

/** 수집기가 최근 확인한 productId·itemId·vendorItemId와 동일한 쿠팡 상품 URL만 구매 경로로 허용한다. */
export function hasCollectorVerifiedPurchasePath(product: CollectorVerifiedProduct, now = new Date()) {
  if (!product.inStock || !product.affiliateUrl || Number(product.wowMemberPrice ?? 0) <= 0 || !product.wowMemberPriceObservedAt) return false;
  const observedAt = new Date(product.wowMemberPriceObservedAt);
  if (!Number.isFinite(observedAt.getTime()) || observedAt.getTime() < now.getTime() - TRUST_WINDOW_MS) return false;

  const [productId, itemId, vendorItemId] = product.externalProductId.split(":");
  if (!productId || !itemId || !vendorItemId) return false;
  try {
    const url = new URL(product.affiliateUrl);
    return /(^|\.)coupang\.com$/i.test(url.hostname)
      && url.pathname === `/vp/products/${productId}`
      && url.searchParams.get("itemId") === itemId
      && url.searchParams.get("vendorItemId") === vendorItemId;
  } catch {
    return false;
  }
}
