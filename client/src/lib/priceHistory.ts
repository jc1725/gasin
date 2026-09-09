export type OfficialPricePoint = { price: number; recordedAt: Date | string };
export type ConfirmedPricePoint = { id: number; price: number; checkedAt: Date | string };
export type CollectedPricePoint = {
  productId: string;
  price: number | null;
  collectedAt: Date | string;
  inStock?: boolean;
  optionName?: string | null;
};

export type SoldOutObservation = {
  productId: string;
  price: number | null;
  occurredAt: Date;
  optionName?: string | null;
};

export type UnifiedPricePoint = {
  price: number;
  occurredAt: Date;
  key: string;
  source: "gasyn" | "extension";
};

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

/** 최근 수집 관측 중 품절 상태를 가격 이력 카드에 표시하기 위한 목록입니다. */
export function getRecentSoldOutObservations(points: CollectedPricePoint[], limit = 6): SoldOutObservation[] {
  return points
    .filter(point => point.inStock === false)
    .map(point => ({
      productId: point.productId,
      price: Number.isSafeInteger(point.price) && (point.price ?? 0) > 0 ? point.price : null,
      occurredAt: toDate(point.collectedAt),
      optionName: point.optionName,
    }))
    .filter(point => !Number.isNaN(point.occurredAt.getTime()))
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
    .slice(0, limit);
}

export function mergeAllPriceHistory(official: OfficialPricePoint[], confirmed: ConfirmedPricePoint[], collected: CollectedPricePoint[] = []): UnifiedPricePoint[] {
  const points = [
    ...official.map((point, index) => ({ price: point.price, occurredAt: toDate(point.recordedAt), key: `official-${index}`, source: "gasyn" as const })),
    ...confirmed.map(point => ({ price: point.price, occurredAt: toDate(point.checkedAt), key: `confirmed-${point.id}`, source: "gasyn" as const })),
    ...collected.filter(point => point.inStock !== false).flatMap((point, index) => typeof point.price === "number" && Number.isSafeInteger(point.price) && point.price > 0
      ? [{ price: point.price as number, occurredAt: toDate(point.collectedAt), key: `extension-${point.productId}-${index}`, source: "extension" as const }]
      : []),
  ].filter(point => !Number.isNaN(point.occurredAt.getTime()));

  points.sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime() || left.key.localeCompare(right.key));

  const seen = new Set<string>();
  return points.filter(point => {
    const signature = `${point.source}:${point.occurredAt.getTime()}:${point.price}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

/** 기존 공식·사용자 확인 이력 호출부와의 호환성을 위한 별칭입니다. */
export function mergePriceHistory(official: OfficialPricePoint[], confirmed: ConfirmedPricePoint[]) {
  return mergeAllPriceHistory(official, confirmed);
}

/** 출처와 무관하게 같은 날짜에 기록된 가격 중 가장 낮은 값만 차트에 남깁니다. */
export function collapsePriceHistoryToDailyLow(points: UnifiedPricePoint[]): UnifiedPricePoint[] {
  const lowestByDay = new Map<string, UnifiedPricePoint>();
  for (const point of points) {
    const day = `${point.occurredAt.getFullYear()}-${point.occurredAt.getMonth()}-${point.occurredAt.getDate()}`;
    const current = lowestByDay.get(day);
    if (!current || point.price < current.price || (point.price === current.price && point.occurredAt.getTime() < current.occurredAt.getTime())) {
      lowestByDay.set(day, point);
    }
  }
  return Array.from(lowestByDay.values()).sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime() || left.key.localeCompare(right.key));
}

export function getLowestPrice(points: UnifiedPricePoint[], fallback: number) {
  return points.length ? Math.min(...points.map(point => point.price)) : fallback;
}
