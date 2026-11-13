import type { ProductCardItem } from "@/components/ProductCard";

/**
 * 2026-11-13: 검색 화면은 결과를 sessionStorage에 보관했다가 뒤로 가기 때 그대로 복원한다.
 * 그 사이 카드를 눌러 상품이 저장되고 수집기가 가격·옵션을 확인해도, 복원된 카드는 검색 당시의
 * 쿠팡 API 기본가와 "옵션 미확인" 상태로 남아 있었다. 같은 정확 SKU(externalProductId)의 저장된
 * 최신 행이 있으면 그 행으로 바꿔 보여준다. 저장된 행이 없으면 원래 카드를 그대로 둔다.
 */
export function overlayStoredSearchProducts(items: ProductCardItem[], stored: readonly ProductCardItem[]): ProductCardItem[] {
  if (stored.length === 0) return items;
  const byKey = new Map(stored.flatMap(product => (product.externalProductId ? [[product.externalProductId, product] as const] : [])));
  return items.map(item => {
    const latest = item.externalProductId ? byKey.get(item.externalProductId) : undefined;
    return latest ? { ...latest, pendingMaterialize: null } : item;
  });
}

/** 저장된 최신 상태를 조회할 정확 SKU 키 목록(중복 제거, 최대 30개). */
export function getSearchResultExternalIds(items: readonly ProductCardItem[]) {
  return Array.from(new Set(items.flatMap(item => (item.externalProductId ? [item.externalProductId] : [])))).slice(0, 30);
}
