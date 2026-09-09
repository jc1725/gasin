export type ExternalCronQueueProduct = {
  source: "goldbox" | "search" | "bestcategory" | "collection";
  refreshState: "fresh" | "deferred" | "awaiting_collection" | "not_in_goldbox";
  isActive: boolean;
  inStock: boolean;
  nextRefreshAt: Date | null;
};

/** 외부 가격 cron이 실제로 선택할 수 있는 검색 상품만 별도로 집계합니다. */
export function summarizeExternalCronQueue(products: ExternalCronQueueProduct[], now = new Date()) {
  const summary = {
    dueNow: 0,
    scheduledLater: 0,
    awaitingCollection: 0,
    excludedSoldOut: 0,
    excludedInactive: 0,
    excludedNonSearch: 0,
  };

  for (const product of products) {
    if (product.refreshState === "awaiting_collection") {
      if (product.isActive && product.inStock) summary.awaitingCollection += 1;
      else if (!product.isActive) summary.excludedInactive += 1;
      else if (!product.inStock) summary.excludedSoldOut += 1;
      continue;
    }
    if (product.refreshState !== "deferred") continue;
    if (product.source !== "search") {
      summary.excludedNonSearch += 1;
      continue;
    }
    if (!product.isActive) {
      summary.excludedInactive += 1;
      continue;
    }
    if (!product.inStock) {
      summary.excludedSoldOut += 1;
      continue;
    }
    if (!product.nextRefreshAt || product.nextRefreshAt.getTime() <= now.getTime()) summary.dueNow += 1;
    else summary.scheduledLater += 1;
  }

  return { ...summary, excludedTotal: summary.excludedSoldOut + summary.excludedInactive + summary.excludedNonSearch };
}
