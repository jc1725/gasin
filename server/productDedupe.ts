import { isUngroupedProductKey, resolveStoredProductGroupKey, type StoredGroupKeyInput } from "./productVariant";

type GroupedProduct = {
  familyVariantKey: string | null;
  currentPrice: number;
  /** 값이 없으면(옛 호출부·검색 응답 등) 재고가 있는 것으로 본다. */
  inStock?: boolean;
  /** 값이 없으면 확인된 가격으로 본다. */
  refreshState?: string | null;
};

type RecencyGroupedProduct = GroupedProduct & { lastSeenAt: Date };

/**
 * 2026-10-01: 추적·노출 단위를 판매자별 SKU에서 제품(상품명 + 용량 + 수량)으로 올렸다.
 *
 * 예전에는 familyKey(이름에서 용량·수량을 지운 값)와 unitLabel로 묶었는데, unitLabel은
 * 실제 용량이 아니라 단가 환산 기준("100g"·"100ml"·뷰티는 "10ml")이라서 30ml와 100ml가
 * 같은 묶음에 들어갔다. 게다가 대표를 "묶음 개수당 가격"으로 뽑아서 용량이 작은 쪽이
 * 최저가로 올라오는 문제가 있었다. 이제 용량·수량까지 같은 행만 한 그룹이 되므로
 * (server/productVariant.ts의 buildProductGroupKey) 그룹 안에서는 현재가를 그대로
 * 비교하면 된다 — 같은 용량·같은 수량이라 정규화가 필요 없다.
 *
 * 대표 선정 규칙(2026-10-01, 사용자 결정): 가격차 가드 없이 항상 최저가를 대표로 쓴다.
 * 유일한 예외는 품절과 가격 0원으로, 이건 "더 싼 선택지"가 아니라 살 수 없는 행이라
 * 제외한다. 그룹 전체가 품절이면 그중 최저가를 그대로 대표로 남긴다.
 */
function groupKeyOf(product: GroupedProduct) {
  const key = product.familyVariantKey?.trim();
  if (!key) return null;
  // 용량을 못 읽어 단독 그룹이 된 행은 어차피 키가 SKU라 혼자지만, 비교 비용을 아끼려고
  // 그룹 구성 자체에서 뺀다.
  if (isUngroupedProductKey(key)) return null;
  return key.toLowerCase();
}

function isPurchasable(product: GroupedProduct) {
  return product.inStock !== false && product.currentPrice > 0;
}

/**
 * 쿠팡 검색에서 정확 SKU를 못 찾아 가격 갱신이 멈춘 행(awaiting_collection)은 표시된 가격이
 * 지금 값이라는 보장이 없다. 같은 제품을 파는 다른 판매자 행이 정상 갱신되고 있다면 그쪽을
 * 대표로 쓴다 — 이건 "얼마나 싼지"를 따지는 가격차 가드가 아니라, 확인되지 않은 가격을
 * 확인된 가격보다 앞세우지 않는다는 뜻이다. 그룹 전체가 멈춰 있으면 그대로 최저가를 쓴다.
 */
function isVerified(product: GroupedProduct) {
  return product.refreshState !== "awaiting_collection";
}

/** 두 후보 중 대표로 더 적합한 쪽을 고른다. 구매 가능하고 가격이 확인된 행이 우선한다. */
function preferred<T extends GroupedProduct>(left: T, right: T) {
  const leftBuyable = isPurchasable(left);
  const rightBuyable = isPurchasable(right);
  if (leftBuyable !== rightBuyable) return leftBuyable ? left : right;
  const leftVerified = isVerified(left);
  const rightVerified = isVerified(right);
  if (leftVerified !== rightVerified) return leftVerified ? left : right;
  return right.currentPrice < left.currentPrice ? right : left;
}

/**
 * 같은 제품 그룹에서 최저가 한 행만 남긴다. 입력 순서(관련도순 등)는 유지한다 —
 * 그룹이 처음 등장한 자리에 대표를 채워 넣고 나머지는 제거한다.
 */
export function selectCheapestPerProductGroup<T extends GroupedProduct>(products: T[]): T[] {
  const result: T[] = [];
  const positionByGroup = new Map<string, number>();

  for (const product of products) {
    const groupKey = groupKeyOf(product);
    if (!groupKey) {
      result.push(product);
      continue;
    }
    const position = positionByGroup.get(groupKey);
    if (position === undefined) {
      positionByGroup.set(groupKey, result.length);
      result.push(product);
      continue;
    }
    result[position] = preferred(result[position]!, product);
  }

  return result;
}

/**
 * 같은 제품 그룹에서 최저가 한 행만 남기고 최근 관측 순으로 정렬한다.
 * 메인·카테고리 목록처럼 "최근에 확인된 상품부터" 보여주는 화면에서 쓴다.
 */
export function selectCheapestPerProductGroupByRecency<T extends RecencyGroupedProduct>(products: T[]): T[] {
  return selectCheapestPerProductGroup(products)
    .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime());
}

type FamilyProduct = {
  familyKey: string | null;
  currentPrice: number;
  lastSeenAt: Date;
};

/**
 * 메인 목록에서 같은 상품군(용량이 다른 형제 상품까지 포함)이 과도하게 반복되지 않도록
 * 상품군별 대표 몇 개만 남긴다. 제품 그룹(용량·수량까지 같은 묶음)과는 다른 층위의
 * 정리라서 familyKey를 그대로 쓴다 — 상품군 정보가 없는 항목은 서로 다른 상품일 수
 * 있어 합치지 않는다.
 */
export function selectRepresentativesPerFamily<T extends FamilyProduct>(products: T[], maxPerFamily = 2) {
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

type RelatedVariantRow = GroupedProduct & StoredGroupKeyInput & { id: number; variantLabel: string | null };

/**
 * 2026-10-01: 상품 상세 "다른 옵션 보기"가 58개 구성처럼 길게 나오던 문제. 같은 상품군
 * (familyKey)의 활성 행을 전부 돌려줘서, 같은 구성(80ml·1개)을 파는 여러 판매자 행과
 * 용량을 읽지 못한 행이 줄줄이 반복됐다. 목록을 "구성 하나당 한 줄"로 줄인다.
 *
 * 1. 지금 보고 있는 상품과 같은 구성(같은 제품 그룹)의 다른 판매자 행은 뺀다. 그중 더 싼
 *    행은 상세 상단 "같은 제품 더 싼 판매처" 배너가 이미 보여 준다.
 * 2. 나머지는 구성마다 대표 한 행(selectCheapestPerProductGroup: 구매 가능·가격 확인·최저가)만
 *    남긴다. familyVariantKey가 아직 백필되지 않은 행은 저장된 값으로 같은 규칙의 키를 계산한다.
 * 3. 용량·수량 정보가 없는 행은 어떤 구성인지 알 수 없어 비교에 쓸모가 없으므로, 정보가 있는
 *    행이 하나라도 있으면 숨긴다. 정보가 있는 행이 하나도 없을 때만 그대로 보여 준다.
 *
 * 입력 순서(단위가·현재가 오름차순)는 유지한다. DB 데이터는 건드리지 않고 표시만 줄인다.
 */
export function selectRelatedVariantsForDisplay<T extends RelatedVariantRow>(current: RelatedVariantRow, rows: T[]): T[] {
  const keyOf = (row: RelatedVariantRow) => groupKeyOf({ ...row, familyVariantKey: row.familyVariantKey ?? resolveStoredProductGroupKey(row) });
  const currentGroup = keyOf(current);
  const others = rows.filter(row => row.id !== current.id && !(currentGroup && keyOf(row) === currentGroup));
  const shadows = others.map(row => ({ ...row, familyVariantKey: row.familyVariantKey ?? resolveStoredProductGroupKey(row), original: row }));
  const representatives = selectCheapestPerProductGroup(shadows).map(shadow => shadow.original);
  const withOptionInfo = representatives.filter(row => Boolean(row.variantLabel?.trim()));
  return withOptionInfo.length > 0 ? withOptionInfo : representatives;
}
