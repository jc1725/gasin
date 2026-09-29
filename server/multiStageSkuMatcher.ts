import type { CatalogSearchResult } from "./catalogSearch";

export const MAX_PRICE_REFRESH_SEARCHES_PER_PRODUCT = 2;
export const MIN_CANDIDATE_SCORE_FOR_SECOND_QUERY = 28;

export type SkuMatchProduct = {
  externalProductId: string;
  name: string;
  variantLabel?: string | null;
  unitLabel?: string | null;
  quantity?: number | null;
  packSize?: string | null;
  isRocket?: boolean;
  isFreeShipping?: boolean;
};

export type SkuCandidateScore = {
  product: SkuMatchProduct;
  score: number;
  reasons: string[];
  exactSku: boolean;
};

export type MultiStageSkuMatch = {
  exact: SkuCandidateScore | null;
  best: SkuCandidateScore | null;
  candidates: SkuCandidateScore[];
  queries: string[];
  rateLimited?: CatalogSearchResult;
};

function compact(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function normalized(value: string | null | undefined) {
  return compact(value)
    .toLowerCase()
    .replace(/[(),/·|:+_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function comparable(value: string | null | undefined) {
  return normalized(value).replace(/\s/g, "");
}

function parseSku(value: string) {
  const [productId, itemId, vendorItemId] = value.split(":");
  return { productId, itemId: itemId ?? null, vendorItemId: vendorItemId ?? null };
}

function measurementTokens(product: SkuMatchProduct) {
  const text = [product.name, product.variantLabel, product.unitLabel, product.packSize]
    .filter(Boolean)
    .join(" ");
  const capacities = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*(ml|mL|l|L|g|kg|mg|cm|mm|인치|호)/g))
    .map(match => `${match[1]}${match[2].toLowerCase()}`);
  const quantities = [
    ...(Number.isInteger(product.quantity) && (product.quantity ?? 0) > 0 ? [`${product.quantity}개`] : []),
    ...Array.from(text.matchAll(/(\d+)\s*(개입|개|팩|세트|매|봉|롤|캔|병)/g)).map(match => `${match[1]}${match[2]}`),
  ];
  return {
    capacities: Array.from(new Set(capacities)),
    quantities: Array.from(new Set(quantities)),
  };
}

/**
 * 2026-09-29: 예전 1차 검색어는 상품명 전체(쉼표 앞까지)에 규격을 붙여 50자로 자른
 * 긴 문장이었다. "새마원 HACCP 3년이상 숙성 하동 봄앤향 황매실청 스틱 매실엑기스"처럼
 * 수식어가 많은 이름은 이 긴 키워드로 검색하면 결과가 거의 나오지 않는다(쿠팡 검색은
 * 짧은 키워드에서 재현율이 높다). 이제 핵심 단어만 남긴 짧은 검색어 두 개를 쓴다.
 */
export const PRICE_REFRESH_CORE_NAME_TOKENS = 5;
export const PRICE_REFRESH_SHORT_NAME_TOKENS = 3;

export function buildPriceRefreshQueryVariants(product: SkuMatchProduct) {
  const measurements = measurementTokens(product);
  const baseName = compact(product.name).replace(/[,·].*$/, "");
  const nameTokens = baseName.split(/\s+/).filter(Boolean);
  const coreName = nameTokens.slice(0, PRICE_REFRESH_CORE_NAME_TOKENS).join(" ");
  const shortName = nameTokens.slice(0, PRICE_REFRESH_SHORT_NAME_TOKENS).join(" ");
  const sizeAndQuantity = [...measurements.capacities, ...measurements.quantities].join(" ");
  const primaryCapacity = measurements.capacities[0] ?? "";
  const variants = [
    [coreName, sizeAndQuantity].filter(Boolean).join(" "),
    [shortName, primaryCapacity].filter(Boolean).join(" "),
    coreName,
    baseName,
  ];
  return Array.from(new Set(variants))
    .map(query => query.slice(0, 50).trim())
    .filter(Boolean)
    .slice(0, MAX_PRICE_REFRESH_SEARCHES_PER_PRODUCT);
}

function overlapRatio(expected: Set<string>, actual: Set<string>) {
  if (expected.size === 0) return 0;
  let matched = 0;
  for (const token of Array.from(expected)) if (actual.has(token)) matched += 1;
  return matched / expected.size;
}

export function scoreSkuCandidate(stored: SkuMatchProduct, candidate: SkuMatchProduct): SkuCandidateScore {
  const storedSku = parseSku(stored.externalProductId);
  const candidateSku = parseSku(candidate.externalProductId);
  const reasons: string[] = [];
  let score = 0;

  if (candidateSku.productId === storedSku.productId) {
    score += 32;
    reasons.push("productId 일치");
  }
  if (candidateSku.itemId && candidateSku.itemId === storedSku.itemId) {
    score += 28;
    reasons.push("itemId 일치");
  }
  if (candidateSku.vendorItemId && candidateSku.vendorItemId === storedSku.vendorItemId) {
    score += 28;
    reasons.push("vendorItemId 일치");
  }

  const expectedTokens = new Set(normalized(stored.name).split(" ").filter(token => token.length >= 2));
  const actualTokens = new Set(normalized(candidate.name).split(" ").filter(token => token.length >= 2));
  const nameOverlap = overlapRatio(expectedTokens, actualTokens);
  if (nameOverlap >= 0.8) {
    score += 18;
    reasons.push(`상품명 ${Math.round(nameOverlap * 100)}% 일치`);
  } else if (nameOverlap >= 0.55) {
    score += 10;
    reasons.push(`상품명 ${Math.round(nameOverlap * 100)}% 부분 일치`);
  }

  const expectedMeasurements = measurementTokens(stored);
  const candidateText = comparable([candidate.name, candidate.variantLabel, candidate.unitLabel, candidate.packSize].filter(Boolean).join(" "));
  const capacityMatched = expectedMeasurements.capacities.length === 0
    || expectedMeasurements.capacities.some(token => candidateText.includes(comparable(token)));
  const quantityMatched = expectedMeasurements.quantities.length === 0
    || expectedMeasurements.quantities.some(token => candidateText.includes(comparable(token)));
  if (capacityMatched && expectedMeasurements.capacities.length > 0) {
    score += 10;
    reasons.push("용량·규격 일치");
  }
  if (quantityMatched && expectedMeasurements.quantities.length > 0) {
    score += 10;
    reasons.push("수량·포장 일치");
  }
  if (candidate.isRocket || candidate.isFreeShipping) {
    score += 2;
    reasons.push("로켓·무료배송 후보");
  }

  const exactSku = candidate.externalProductId === stored.externalProductId;
  if (exactSku) {
    score += 10;
    reasons.unshift("productId·itemId·vendorItemId 전체 일치");
  }
  return { product: candidate, score, reasons, exactSku };
}

/**
 * 2026-09-29: 2차 시도로 "상품 ID 숫자를 검색어로 넣는" 공식 재조회를 했었다. 쿠팡 검색은
 * 숫자 ID를 일반 키워드로 취급해서 해당 상품이 나올 확률이 낮았고, 상품당 API 호출만
 * 2배로 늘렸다(가격 추적 분당 예산을 밀어내 보호 모드가 자주 걸렸다). 이제 2차 시도도
 * 더 짧게 줄인 키워드 검색으로 한다.
 */
export async function findSkuWithFallbackQueries(
  stored: SkuMatchProduct,
  search: (query: string) => Promise<CatalogSearchResult>,
): Promise<MultiStageSkuMatch> {
  const queries = buildPriceRefreshQueryVariants(stored);
  const scoredBySku = new Map<string, SkuCandidateScore>();
  let rateLimited: CatalogSearchResult | undefined;

  for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
    const query = queries[queryIndex]!;
    const result = await search(query);
    if (result.source === "rate_limited") {
      rateLimited = result;
      break;
    }
    for (const candidate of result.products) {
      const scored = scoreSkuCandidate(stored, candidate);
      const previous = scoredBySku.get(candidate.externalProductId);
      if (!previous || scored.score > previous.score) scoredBySku.set(candidate.externalProductId, scored);
    }
      const exact = Array.from(scoredBySku.values()).find(candidate => candidate.exactSku);
    if (exact) {
      const candidates = Array.from(scoredBySku.values()).sort((left, right) => right.score - left.score);
      return { exact, best: candidates[0] ?? exact, candidates, queries: queries.slice(0, queries.indexOf(query) + 1), rateLimited };
    }
    const best = Array.from(scoredBySku.values()).sort((left, right) => right.score - left.score)[0];
    if (queryIndex === 0 && best && best.score >= 70) {
      // 1차에서 충분히 가까운 후보(70점 이상)가 나왔는데도 정확 SKU가 아니면, 2차 검색을
      // 더 해도 같은 결과일 가능성이 높다. 호출을 아끼고 수집기 관측에 맡긴다.
      break;
    }
  }

  const candidates = Array.from(scoredBySku.values()).sort((left, right) => right.score - left.score);
    return { exact: null, best: candidates[0] ?? null, candidates, queries, rateLimited };
}
