export type PriceRefreshSearchProduct = {
  name: string;
  variantLabel?: string | null;
  unitLabel?: string | null;
  quantity?: number | null;
  packSize?: string | null;
};

// 쿠팡 파트너스 Search API는 keyword를 최대 50자로 제한한다.
// 이 제한을 넘기면 한 상품의 오류가 외부 cron 실행 전체를 500으로 끝낼 수 있다.
const MAX_PRICE_REFRESH_SEARCH_KEYWORD_LENGTH = 50;

function compact(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function hasEquivalentTerm(query: string, term: string) {
  const normalizedQuery = query.replace(/[\s,·×xX]/g, "").toLowerCase();
  const normalizedTerm = term.replace(/[\s,·×xX]/g, "").toLowerCase();
  return normalizedTerm.length > 0 && normalizedQuery.includes(normalizedTerm);
}

/**
 * 가격 재확인은 상품명만으로 검색하면 같은 상품의 다른 구성 결과가 먼저 나올 수 있다.
 * 저장된 옵션·규격·포장·수량을 중복 없이 붙여 정확 SKU가 검색 결과에 포함될 가능성을 높인다.
 */
export function buildPriceRefreshSearchKeyword(product: PriceRefreshSearchProduct) {
  const parts = [compact(product.name)];
  const optionParts = [
    compact(product.variantLabel),
    compact(product.unitLabel),
    compact(product.packSize),
    Number.isInteger(product.quantity) && (product.quantity ?? 0) > 0 ? `${product.quantity}개` : "",
  ].filter(part => part && part !== "가신 수집기 상품");

  for (const optionPart of optionParts) {
    const query = parts.join(" ");
    if (!hasEquivalentTerm(query, optionPart)) parts.push(optionPart);
  }

  return parts.join(" ").slice(0, MAX_PRICE_REFRESH_SEARCH_KEYWORD_LENGTH).trim();
}
