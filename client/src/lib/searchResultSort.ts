import type { ProductCardItem } from "@/components/ProductCard";

export type SearchResultSort = "relevance" | "priceAsc" | "unitPriceAsc";

function hasUnitPrice(product: ProductCardItem): product is ProductCardItem & { unitPrice: number; unitLabel: string } {
  return typeof product.unitPrice === "number" && product.unitPrice > 0 && Boolean(product.unitLabel);
}

/**
 * 단가끼리는 같은 기준(unitLabel)일 때만 비교할 수 있다("100g당"과 "10ml당"은 비교 불가).
 * 결과 안에서 가장 많은 단가 기준을 고르고, 동률이면 관련도 순서상 먼저 나온 기준을 쓴다.
 */
export function getDominantUnitLabel(products: ProductCardItem[]) {
  const counts = new Map<string, number>();
  for (const product of products) {
    if (hasUnitPrice(product)) counts.set(product.unitLabel, (counts.get(product.unitLabel) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [label, count] of Array.from(counts.entries())) {
    if (best === null || count > counts.get(best)!) best = label;
  }
  return best;
}

/** 관련도 순서는 서버가 보장하고, 가격순·단가순만 클라이언트에서 현재 표시 값을 기준으로 정렬합니다. */
export function sortSearchResultProducts(products: ProductCardItem[], sort: SearchResultSort) {
  if (sort === "relevance") return products;
  if (sort === "unitPriceAsc") {
    // 기준이 다르거나 단가를 읽지 못한 상품은 비교할 수 없으므로 관련도 순서 그대로 뒤에 둔다.
    const label = getDominantUnitLabel(products);
    if (!label) return products;
    const comparable = products
      .map((product, index) => ({ product, index }))
      .filter(item => hasUnitPrice(item.product) && item.product.unitLabel === label)
      .sort((left, right) => left.product.unitPrice! - right.product.unitPrice! || left.product.currentPrice - right.product.currentPrice || left.index - right.index)
      .map(item => item.product);
    const comparableIds = new Set(comparable);
    return [...comparable, ...products.filter(product => !comparableIds.has(product))];
  }
  return products
    .map((product, index) => ({ product, index }))
    .sort((left, right) => {
      const leftPrice = left.product.currentPrice > 0 ? left.product.currentPrice : Number.POSITIVE_INFINITY;
      const rightPrice = right.product.currentPrice > 0 ? right.product.currentPrice : Number.POSITIVE_INFINITY;
      return leftPrice - rightPrice || left.index - right.index;
    })
    .map(item => item.product);
}
