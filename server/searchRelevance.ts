export type SearchableProduct = {
  name?: string;
  productName?: string;
  externalProductId?: string;
  variantLabel?: string | null;
  currentPrice?: number;
  price?: number;
  isRocket?: boolean;
  isFreeShipping?: boolean;
};

function normalize(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/초콜릿|초코렛/g, "초코")
    .replace(/[^0-9a-z가-힣]+/g, "");
}

function isOptionOnlyToken(token: string) {
  return /^(?:\d+(?:ml|g|kg|l|개|정|입|세트|팩|롤|장|gb|tb|kpa)|\d+|\d+년형|냉동)$/i.test(token);
}

const SEARCH_TOKEN_EQUIVALENTS: Record<string, string[]> = {
  비플레인: ["beplain"],
  beplain: ["비플레인"],
  아이오페: ["iope"],
  iope: ["아이오페"],
  에스트라: ["aestura"],
  aestura: ["에스트라"],
  헤드앤숄더: ["headshoulders", "headandshoulders"],
  headshoulders: ["헤드앤숄더", "headandshoulders"],
  headandshoulders: ["헤드앤숄더", "headshoulders"],
  클렌징폼: ["폼클렌저", "클렌저"],
  폼클렌저: ["클렌징폼", "클렌저"],
  클렌저: ["클렌징폼", "폼클렌저"],
  미스크: ["미스트"],
  미스트: ["미스크"],
  멘솔: ["멘톨", "쿨멘솔", "쿨멘톨"],
  멘톨: ["멘솔", "쿨멘솔", "쿨멘톨"],
};

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1]! + 1,
        previous[column]! + 1,
        previous[column - 1]! + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    for (let index = 0; index < current.length; index += 1) previous[index] = current[index]!;
  }
  return previous[right.length]!;
}

function matchesSearchToken(token: string, name: string) {
  if (getSearchTokenVariants(token).some(variant => name.includes(variant))) return true;
  if (token.length < 3) return false;
  return name.split(/[^0-9a-z가-힣]+/i).some(candidate => candidate.length >= 3 && editDistance(token, candidate) <= 1);
}

/** 같은 제품군을 뜻하는 쿠팡 상품명 표기 변형을 관련도 비교에 함께 사용합니다. */
export function getSearchTokenVariants(token: string) {
  const normalized = normalize(token);
  return Array.from(new Set([normalized, ...(SEARCH_TOKEN_EQUIVALENTS[normalized] ?? [])]));
}

/**
 * 상품명 찾기에 필요한 핵심 토큰만 남긴다. 용량·수량·묶음·괄호 표기는 옵션 확인에는 유용하지만,
 * 쿠팡 API 결과의 상품명에 없을 수 있으므로 관련도 필수 조건에서 제외한다.
 */
export function buildSearchKeywordVariants(keyword: string) {
  const trimmed = keyword.trim().replace(/\s+/g, " ");
  if (!trimmed) return [];
  const variants = [trimmed];
  if (trimmed.includes("헤드앤숄더") && trimmed.includes("샴푸")) {
    const coolingToken = trimmed.includes("멘솔") || trimmed.includes("멘톨") ? " 쿨 멘솔" : "";
    variants.push(`헤드앤숄더 샴푸${coolingToken}`);
  }
  if (trimmed.includes("토탈 솔루션")) variants.push(trimmed.replace(/토탈\s+솔루션/g, "토탈솔루션"));
  if (trimmed.includes("쿨 멘솔") || trimmed.includes("쿨 멘톨")) variants.push(trimmed.replace(/쿨\s+(?:멘솔|멘톨)/g, "쿨멘솔"));
  if (trimmed.includes("클렌징폼")) variants.push(trimmed.replace(/클렌징폼/g, "폼클렌저"));
  if (trimmed.includes("폼클렌저")) variants.push(trimmed.replace(/폼클렌저/g, "클렌징폼"));
  if (trimmed.includes("미스크")) variants.push(trimmed.replace(/미스크/g, "미스트"));
  if (trimmed.includes("미스트")) variants.push(trimmed.replace(/미스트/g, "미스크"));
  const tokens = trimmed.split(" ").filter(Boolean);
  if (tokens.length >= 3) {
    // 쿠팡 상품명이 ‘수분 크림’/‘수분크림’처럼 붙어 있는 경우를 보완합니다.
    variants.push(`${tokens[0]} ${tokens.slice(1).join("")}`);
  }
  return Array.from(new Set(variants)).slice(0, 3);
}

export function getSearchTokens(keyword: string) {
  return keyword
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .split(/\s+/)
    .map(normalize)
    .filter(token => token.length >= 2 && !isOptionOnlyToken(token))
    .slice(0, 6);
}

/** 용량·수량 숫자는 핵심 상품명 토큰에서 제외하되 후보 정렬에는 별도 점수로 반영합니다. */
export function getSearchOptionTokens(keyword: string) {
  return keyword
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .split(/\s+/)
    .map(normalize)
    .filter(token => /\d/.test(token) && token.length >= 1)
    .slice(0, 4);
}

function getProductPageId(product: SearchableProduct) {
  return product.externalProductId?.split(":")[0] ?? "";
}

function getSkuSpecificity(product: SearchableProduct) {
  return product.externalProductId?.split(":").filter(Boolean).length ?? 0;
}

function getDuplicateCandidateKey(product: SearchableProduct) {
  const name = normalize(product.name ?? product.productName);
  const variant = normalize(product.variantLabel ?? undefined);
  const price = product.currentPrice ?? product.price ?? "";
  const pageId = getProductPageId(product);
  return pageId && name && price !== "" ? `${pageId}|${name}|${variant}|${price}` : null;
}

/**
 * productId 단독 레거시 행과 productId:itemId:vendorItemId 정확 옵션 행이 같은 구성·가격으로
 * 함께 남아 있을 때는 정확 SKU를 우선한다. 서로 다른 vendorItemId의 정확 SKU끼리는 유지한다.
 */
function removeLegacySkuDuplicates<T extends SearchableProduct>(products: T[]) {
  const selected = new Map<string, { index: number; specificity: number }>();
  const result: Array<{ product: T; index: number; key: string | null }> = [];
  products.forEach((product, index) => {
    const key = getDuplicateCandidateKey(product);
    if (!key) {
      result.push({ product, index, key: null });
      return;
    }
    const existing = selected.get(key);
    const specificity = getSkuSpecificity(product);
    if (!existing) {
      selected.set(key, { index, specificity });
      result.push({ product, index, key });
      return;
    }
    if (existing.specificity === 1 && specificity > 1) {
      const existingResult = result.find(item => item.key === key && item.index === existing.index);
      if (existingResult) existingResult.product = product;
      selected.set(key, { index, specificity });
      return;
    }
    if (existing.specificity > 1 && specificity === 1) return;
    // 두 정확 SKU는 서로 다른 vendorItemId 옵션일 수 있으므로 모두 유지한다.
    result.push({ product, index, key: null });
  });
  return result.map(item => item.product);
}

/**
 * 검색어에서 뽑은 핵심 토큰(용량·수량 등 옵션 토큰 제외) 전부가 상품명에 들어있는지
 * 확인한다. 용량·수량은 name이 아니라 variantLabel·unitLabel에 담기는 경우가
 * 많으므로, 원본 검색어 문자열을 그대로 비교하면 "220ml", "1개" 같은 옵션 표기 때문에
 * 실제로는 정확히 일치하는 상품도 매번 불일치로 판정된다. 대신 옵션을 제외한 핵심
 * 토큰만 전부 맞는지 확인해 "검색 의도가 완전히 충족됐는지"를 본다.
 *
 * 가신 수집기가 등록한 상품처럼 DB 저장 개수가 적어(3개 미만) rankSearchResults의
 * 완화 기준(토큰 60%)으로는 '충분한 저장 결과'로 인정받지 못하는 경우에도, 핵심
 * 토큰이 전부 일치하는 상품을 이미 찾았다면 외부 쿠팡 API 결과로 덮어쓰지 않고
 * 그 저장 결과를 그대로 신뢰해도 된다는 신호로 쓰인다.
 */
export function hasFullKeywordMatch<T extends SearchableProduct>(keyword: string, products: T[]) {
  const tokens = getSearchTokens(keyword);
  if (tokens.length === 0) return false;
  return products.some(product => {
    const name = normalize(product.name ?? product.productName);
    return tokens.every(token => getSearchTokenVariants(token).some(variant => name.includes(variant)));
  });
}

/** 배송 태그가 있는 결과가 하나라도 있으면 안정 배송 상품만 노출하고, 태그가 전혀 없을 때만 전체 관련 결과로 폴백한다. */
export function filterStableDeliveryResults<T extends SearchableProduct>(products: T[]) {
  const stableDeliveryProducts = products.filter(product => product.isRocket === true || product.isFreeShipping === true);
  return stableDeliveryProducts.length > 0 ? stableDeliveryProducts : products;
}

/**
 * 검색 API 응답의 원래 순서는 같은 관련도 안에서 그대로 둔다.
 * 검색어와 실제 상품명이 겹치지 않는 항목은 캐시·신규 응답 모두에서 표시하지 않는다.
 */
export function rankSearchResults<T extends SearchableProduct>(keyword: string, products: T[]) {
  const query = normalize(keyword);
  const tokens = getSearchTokens(keyword);
  const optionTokens = getSearchOptionTokens(keyword);
  const requiredMatches = tokens.length <= 2 ? tokens.length : Math.max(2, Math.ceil(tokens.length * 0.6));
  const scored = products.map((product, index) => {
    const name = normalize(product.name ?? product.productName);
    const fullMatch = Boolean(query) && name.includes(query);
    const tokenMatches = tokens.filter(token => matchesSearchToken(token, name)).length;
    const firstTokenMatches = tokens.length > 0 && matchesSearchToken(tokens[0]!, name);
    const optionMatches = optionTokens.filter(token => matchesSearchToken(token, name)).length;
    // 3개 이상 토큰의 상품 검색에서는 첫 토큰(대개 브랜드·제품군)을 반드시 포함시켜
    // '수분 크림'만 겹치는 타 브랜드 상품이 섞이지 않게 한다.
    const hasEnoughCoreMatches = tokens.length > 0
      && tokenMatches >= requiredMatches
      && (tokens.length < 3 || firstTokenMatches);
    return {
      product,
      index,
      tokenMatches,
      score: hasEnoughCoreMatches ? (fullMatch ? 1000 : 0) + tokenMatches * 100 + optionMatches * 35 : 0,
    };
  });
  const strictMatches = scored
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(item => item.product);
  if (strictMatches.length > 0) return removeLegacySkuDuplicates(strictMatches);

  // 쿠팡 API가 상품명을 축약하거나 용량·구성 문구를 다르게 반환하면
  // 엄격한 핵심 토큰 기준에서 전부 탈락할 수 있다. 다만 여러 단어 검색에서
  // '크림' 같은 일반명사 하나만 맞는 무관 상품을 fallback으로 노출하면 안 된다.
  const relaxedRequiredMatches = tokens.length <= 1 ? 1 : Math.max(2, Math.ceil(tokens.length * 0.5));
  const brandToken = tokens[0];
  const relaxedMatches = scored
    .filter(item => {
      const brandMatches = brandToken
        ? matchesSearchToken(brandToken, normalize(item.product.name ?? item.product.productName))
        : true;
      return item.tokenMatches >= relaxedRequiredMatches && brandMatches;
    })
    .sort((left, right) => right.tokenMatches - left.tokenMatches || left.index - right.index)
    .map(item => item.product);
  return removeLegacySkuDuplicates(relaxedMatches);
}
