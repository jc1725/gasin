import type { ProductSource } from "./db";

/**
 * 2026-11-20: "골드박스 상품 숫자가 너무 적다" — 오늘 골드박스로 28개를 저장했는데 화면에는 8개만
 * 남았다. 골드박스 화면은 products.source = "goldbox"인 활성 행만 보여주는데, 같은 상품이 이후
 * 검색 재확인(1분 주기)이나 카테고리 베스트 갱신 결과에 함께 나오면 upsert가 source를
 * "search"/"bestcategory"로 덮어써 골드박스 목록에서 빠졌다.
 *
 * source는 "이 상품이 지금 어느 목록에 속하는가"를 뜻하므로, 활성 상태인 골드박스·카테고리 베스트
 * 상품은 검색 결과로 다시 확인돼도 그 소속을 유지한다(골드박스 > 카테고리 베스트 > 검색).
 * 비활성(어제 골드박스에서 내려간) 행은 새 소속을 그대로 받는다.
 */
const SOURCE_RANK: Record<ProductSource, number> = { goldbox: 3, bestcategory: 2, search: 1, collection: 0 };

export function resolveUpsertSource(existing: { source: ProductSource; isActive: boolean } | undefined, incoming: ProductSource): ProductSource {
  if (!existing || !existing.isActive) return incoming;
  if (incoming === "collection" || existing.source === "collection") return incoming;
  return SOURCE_RANK[existing.source] > SOURCE_RANK[incoming] ? existing.source : incoming;
}
