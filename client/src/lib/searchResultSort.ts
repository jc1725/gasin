import type { ProductCardItem } from "@/components/ProductCard";

export type SearchResultSort = "relevance" | "priceAsc";

/** 관련도 순서는 서버가 보장하고, 가격순만 클라이언트에서 현재 표시 가격을 기준으로 정렬합니다. */
export function sortSearchResultProducts(products: ProductCardItem[], sort: SearchResultSort) {
  if (sort === "relevance") return products;
  return products
    .map((product, index) => ({ product, index }))
    .sort((left, right) => {
      const leftPrice = left.product.currentPrice > 0 ? left.product.currentPrice : Number.POSITIVE_INFINITY;
      const rightPrice = right.product.currentPrice > 0 ? right.product.currentPrice : Number.POSITIVE_INFINITY;
      return leftPrice - rightPrice || left.index - right.index;
    })
    .map(item => item.product);
}
