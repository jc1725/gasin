export function buildDeepLinkUpdate(deepLinkUrl: string | null, updatedAt = new Date(), failureReason: string | null = null) {
  return {
    deepLinkUrl,
    deepLinkStatus: deepLinkUrl ? "ready" as const : "failed" as const,
    deepLinkFailureReason: deepLinkUrl ? null : failureReason,
    deepLinkUpdatedAt: updatedAt,
  };
}

export function buildManualTrackUpdate(
  status: "active" | "waiting" | "rejected",
  productId: number | null,
  lastError: string | null = null,
  nextRetryAt: Date | null = null
) {
  return { status, productId, lastError, nextRetryAt };
}

export function buildManualLookupFailureUpdate(detail: string, nextRetryAt: Date) {
  // A not-yet-discovered product can become available in a later approved API result.
  // Keep it waiting rather than permanently rejecting a syntactically valid Coupang link.
  return buildManualTrackUpdate("waiting", null, detail, nextRetryAt);
}

export function buildProductViewUpdate(currentPriority: "low" | "normal" | "high", viewedAt = new Date()) {
  return {
    lastViewedAt: viewedAt,
    trackingPriority: currentPriority === "low" ? "normal" as const : currentPriority,
  };
}
