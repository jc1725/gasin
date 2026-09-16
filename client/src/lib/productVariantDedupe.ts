type VariantForDedupe = {
  id: number;
  currentPrice: number;
  variantLabel: string | null;
};

/**
 * 2026-09-16: 상품 상세의 "다른 옵션 보기"(SAME PRODUCT FAMILY) 목록에서, 쿠팡이
 * itemId·vendorItemId를 재발급하는 등의 이유로 같은 실제 상품이 두 개의 서로 다른
 * DB 행(하나는 "80ml × 1개"처럼 옵션이 확인된 행, 다른 하나는 옵션을 다시 확인하지
 * 못해 "용량·수량 정보 미제공"으로 남은 행)으로 나란히 보이는 문제를 막는다.
 *
 * - 옵션 정보가 없는 행(variantLabel === null, getOptionDisplay가 "용량·수량 정보
 *   미제공"으로 표시하는 것과 동일한 기준)이 있고, 같은 가격의 다른 행이 옵션 정보를
 *   가지고 있다면(variantLabel !== null) 정보 없는 쪽을 같은 상품의 중복으로 보고
 *   목록에서 숨긴다. 데이터 자체(가격 이력 등)는 건드리지 않고 화면 표시만 줄인다.
 * - 옵션 정보가 없는 행끼리는 비교할 기준이 없으므로 합치지 않고 그대로 둔다 —
 *   가격이 같은 두 행이 실제로는 다른 상품일 수도 있기 때문이다.
 * - 현재 보고 있는 상품(keepId)은 옵션 정보가 없어도 항상 남긴다.
 */
export function dedupeVariantsWithoutOptionInfo<T extends VariantForDedupe>(variants: T[], keepId: number): T[] {
  return variants.filter(variant => {
    if (variant.id === keepId) return true;
    if (variant.variantLabel !== null) return true;
    return !variants.some(other => other.id !== variant.id && other.currentPrice === variant.currentPrice && other.variantLabel !== null);
  });
}
