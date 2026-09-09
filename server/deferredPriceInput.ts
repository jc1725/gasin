export type DeferredPriceInputProduct = {
  id: number;
  source: "goldbox" | "search" | "bestcategory" | "collection";
  lastRefreshReason: string | null;
};

export type LatestAdminConfirmation = {
  productId: number;
  checkedAt: Date;
};

const CONFIRMATION_WINDOW_MS = 48 * 60 * 60 * 1000;

function isAutomaticSearchQueue(product: DeferredPriceInputProduct) {
  return product.source === "search" && (
    product.lastRefreshReason?.includes("Search API 시간당 예산 보호") === true ||
    product.lastRefreshReason?.includes("전체 가격 추적 초기 대기열") === true ||
    product.lastRefreshReason?.includes("관리자 전체 가격 재확인 대기열 등록") === true
  );
}

function isCollectorObserved(product: DeferredPriceInputProduct) {
  return product.lastRefreshReason?.startsWith("가신 수집기") === true;
}

function isSkuMismatch(product: DeferredPriceInputProduct) {
  return product.source === "search" && (
    product.lastRefreshReason?.includes("정확 SKU") === true ||
    product.lastRefreshReason?.includes("productId·itemId·vendorItemId") === true
  );
}

export function classifyDeferredPriceInputs(
  products: DeferredPriceInputProduct[],
  confirmations: LatestAdminConfirmation[],
  now = new Date(),
) {
  const confirmationCutoff = now.getTime() - CONFIRMATION_WINDOW_MS;
  const confirmationByProductId = new Map(confirmations.map(confirmation => [confirmation.productId, confirmation]));
  const manualProducts: DeferredPriceInputProduct[] = [];
  const automaticProducts: DeferredPriceInputProduct[] = [];
  let recentlyConfirmed = 0;
  let collectorObserved = 0;
  let skuMismatch = 0;

  for (const product of products) {
    const confirmation = confirmationByProductId.get(product.id);
    if (confirmation && confirmation.checkedAt.getTime() >= confirmationCutoff) {
      recentlyConfirmed += 1;
      continue;
    }
    if (isAutomaticSearchQueue(product)) {
      automaticProducts.push(product);
      continue;
    }
    if (isCollectorObserved(product)) {
      automaticProducts.push(product);
      collectorObserved += 1;
      continue;
    }
    if (isSkuMismatch(product)) {
      automaticProducts.push(product);
      skuMismatch += 1;
      continue;
    }
    manualProducts.push(product);
  }

  return {
    manualProductIds: new Set(manualProducts.map(product => product.id)),
    automaticProductIds: new Set(automaticProducts.map(product => product.id)),
    summary: {
      totalDeferred: products.length,
      manualInputRequired: manualProducts.length,
      automaticRecheck: automaticProducts.length - collectorObserved,
      collectorObserved,
      recentlyConfirmed,
      skuMismatch,
    },
  };
}
