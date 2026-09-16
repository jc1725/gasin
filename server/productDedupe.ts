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

type QuantityDedupeProduct = {
  familyKey: string | null;
  unitLabel: string | null;
  currentPrice: number;
  quantity: number | null;
};

/** 수량(묶음 개수)이 확인된 항목만 "수량 1개당 가격"을 계산할 수 있다. */
function perItemPrice(product: Pick<QuantityDedupeProduct, "currentPrice" | "quantity">) {
  if (!product.quantity || product.quantity <= 0) return null;
  if (!(product.currentPrice > 0)) return null;
  return product.currentPrice / product.quantity;
}

const UNKNOWN_UNIT_BUCKET = "__unknown_unit__";

/**
 * 상품군(familyKey)만으로 묶지 않고 용량 단위(unitLabel)까지 같은 항목끼리만
 * 묶는다 — "30ml"와 "100ml"처럼 용량 자체가 다르면 수량(묶음 개수)이 아니라
 * 서로 다른 상품일 수 있으므로 한 카드로 합치면 안 된다(selectCheapestPerFamilyUnit과
 * 같은 안전장치). 용량이 아직 확인되지 않은("옵션 미확인") 항목끼리는 비교
 * 기준이 동일하므로 함께 묶어도 안전하다.
 */
function groupKeyFor(product: QuantityDedupeProduct): string | null {
  const familyKey = product.familyKey?.trim().toLowerCase();
  if (!familyKey) return null;
  const unit = product.unitLabel?.trim();
  return `${familyKey}::${unit ? normalizeUnitLabel(unit) : UNKNOWN_UNIT_BUCKET}`;
}

/**
 * 2026-09-16: 검색·목록 화면에 같은 상품이 용량은 같고 수량(묶음 개수)만 다른
 * 카드로 여러 개 흩어져 보이는 문제(예: "30ml 5개" 65,000원 / "30ml 6개" 77,200원이
 * 각각 별도 카드로 나옴) 때문에, 같은 상품군 + 같은 용량 단위 안에서는 "수량
 * 1개당 가격"이 가장 저렴한 항목 하나만 대표로 남긴다.
 *
 * - 원본 배열 순서(관련도순 등)는 그대로 유지한다 — 그룹이 배열에서 처음
 *   등장한 자리에 대표를 채워 넣고, 나머지 중복은 제거한다.
 * - 수량이 확인된 항목이 하나라도 있으면 그중 1개당 가격이 가장 싼 항목이
 *   대표가 된다(수량 미확인 항목은 비교 대상에서 빠지고 대표로 뽑히지 않는다).
 * - 그룹 전체에 수량 확인된 항목이 하나도 없으면 비교할 정규화 기준이 없으므로
 *   현재가가 가장 낮은 항목을 대표로 둔다.
 * - 용량이 다르거나(예: 30ml vs 100ml) 상품군 정보(familyKey)가 없는 항목은
 *   서로 다른 상품일 수 있어 합치지 않고 그대로 남긴다.
 */
export function selectCheapestPerFamilyByItemPrice<T extends QuantityDedupeProduct>(products: T[]): T[] {
  const order: string[] = [];
  const groups = new Map<string, T[]>();
  const result: T[] = [];
  const positionByGroup = new Map<string, number>();

  for (const product of products) {
    const groupKey = groupKeyFor(product);
    if (!groupKey) {
      result.push(product);
      continue;
    }
    if (!groups.has(groupKey)) {
      order.push(groupKey);
      groups.set(groupKey, []);
      positionByGroup.set(groupKey, result.length);
      result.push(product); // 자리만 먼저 확보 — 대표가 정해지면 아래에서 덮어쓴다.
    }
    groups.get(groupKey)!.push(product);
  }

  for (const groupKey of order) {
    const members = groups.get(groupKey)!;
    const withItemPrice = members
      .map(product => ({ product, price: perItemPrice(product) }))
      .filter((entry): entry is { product: T; price: number } => entry.price !== null);

    const winner = withItemPrice.length > 0
      ? withItemPrice.reduce((best, entry) => (entry.price < best.price ? entry : best)).product
      : members.reduce((best, product) => (product.currentPrice < best.currentPrice ? product : best));

    result[positionByGroup.get(groupKey)!] = winner;
  }

  return result;
}
