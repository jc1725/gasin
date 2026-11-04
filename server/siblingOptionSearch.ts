import { getCoupangVariantKey } from "./coupang";
import type { CoupangProduct } from "./coupang";

/**
 * 2026-11-04: 쿠팡 파트너스 API 검색은 쿠팡 웹 검색과 달리 같은 상품의 다른 옵션
 * (예: 비타라온 35ml 1개 / 2개)이나 상품 자체를 검색 결과에 주지 않는 경우가 있다.
 * DB에 이미 추적 중인 상품이 있는데 일반 검색 결과에는 그 상품이 없을 때, 그 상품의
 * 이름으로 한 번 더 검색해 "같은 productId"의 다른 옵션만 골라 보완한다.
 */

const SIBLING_SEARCH_KEYWORD_MAX_LENGTH = 50;
const TRAILING_QUANTITY_PATTERN = /\s*,\s*\d+\s*(?:개입|개|팩|입|병|캔|봉|박스|세트|롤|매)\s*$/;

/** externalProductId("productId:itemId:vendorItemId")에서 productId 부분만 꺼낸다. */
export function extractCoupangProductId(externalProductId: string) {
  return externalProductId.split(":")[0] ?? "";
}

/** 저장된 상품명에서 끝의 ", 1개" 같은 수량 표기를 떼어 옵션이 섞이지 않은 검색어로 만든다. */
export function buildSiblingSearchKeyword(productName: string) {
  return productName.trim().replace(TRAILING_QUANTITY_PATTERN, "").trim().slice(0, SIBLING_SEARCH_KEYWORD_MAX_LENGTH).trim();
}

/** 이미 받은 응답(known) 안에 해당 productId가 하나라도 있으면 형제 옵션 검색이 필요 없다. */
export function hasProductInResults(productId: string, known: CoupangProduct[]) {
  return known.some(item => String(item.productId) === productId);
}

/** 후보 중 같은 productId이면서 아직 모르는 옵션(vendorItemId)만 고른다. 다른 상품은 절대 받지 않는다. */
export function selectSiblingOptions(candidates: CoupangProduct[], productId: string, known: CoupangProduct[]) {
  const knownKeys = new Set(known.map(item => getCoupangVariantKey(item)));
  const seen = new Set<string>();
  return candidates.filter(item => {
    if (String(item.productId) !== productId) return false;
    const key = getCoupangVariantKey(item);
    if (knownKeys.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
