type DedupeProduct = {
  id: number;
  familyKey: string | null;
  unitLabel: string | null;
  currentPrice: number;
  lastSeenAt: Date;
};

function normalizeUnitLabel(unitLabel: string) {
  return unitLabel.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * 동일 상품군에서 같은 단위·용량을 가진 항목은 현재가가 가장 낮은 하나만 남긴다.
 * 상품군이나 단위 정보가 없으면 임의로 합치지 않고 원본 항목을 보존한다.
 */
export function selectCheapestPerFamilyUnit<T extends DedupeProduct>(products: T[]) {
  const selected = new Map<string, T>();
  const passthrough: T[] = [];

  for (const product of products) {
    if (!product.familyKey?.trim() || !product.unitLabel?.trim()) {
      passthrough.push(product);
      continue;
    }

    const key = `${product.familyKey.trim().toLowerCase()}::${normalizeUnitLabel(product.unitLabel)}`;
    const existing = selected.get(key);
    if (!existing || product.currentPrice < existing.currentPrice || (product.currentPrice === existing.currentPrice && product.lastSeenAt > existing.lastSeenAt)) {
      selected.set(key, product);
    }
  }

  return [...passthrough, ...Array.from(selected.values())]
    .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime())
    ;
}

/**
 * 메인 목록에서는 같은 상품군의 용량·묶음 옵션이 과도하게 반복되지 않도록
 * 단위별 최저가 후보 가운데 현재가가 낮은 대표 상품만 최대 개수만큼 남긴다.
 * 상품군 정보가 없는 항목은 서로 다른 상품일 수 있어 임의로 합치지 않는다.
 */
export function selectRepresentativesPerFamily<T extends DedupeProduct>(products: T[], maxPerFamily = 2) {
  const grouped = new Map<string, T[]>();
  const passthrough: T[] = [];

  for (const product of products) {
    const familyKey = product.familyKey?.trim().toLowerCase();
    if (!familyKey) {
      passthrough.push(product);
      continue;
    }
    const group = grouped.get(familyKey) ?? [];
    group.push(product);
    grouped.set(familyKey, group);
  }

  const representatives = Array.from(grouped.values()).flatMap(group => group
    .sort((left, right) => left.currentPrice - right.currentPrice || right.lastSeenAt.getTime() - left.lastSeenAt.getTime())
    .slice(0, Math.max(1, maxPerFamily)));

  return [...passthrough, ...representatives]
    .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime());
}
