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

export function buildPriceRefreshQueryVariants(product: SkuMatchProduct) {
  const measurements = measurementTokens(product);
  const baseName = compact(product.name).replace(/[,·].*$/, "");
  const compactName = compact(product.name).split(/\s+/).slice(0, 8).join(" ");
  const option = compact(product.variantLabel);
  const sizeAndQuantity = [...measurements.capacities, ...measurements.quantities].join(" ");
  const variants = [
    [baseName, sizeAndQuantity].filter(Boolean).join(" "),
    [baseName, option].filter(Boolean).join(" "),
    [compactName, sizeAndQuantity].filter(Boolean).join(" "),
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

export async function findSkuWithFallbackQueries(
  stored: SkuMatchProduct,
  search: (query: string) => Promise<CatalogSearchResult>,
  lookupByProductId?: (productId: string) => Promise<CatalogSearchResult>,
): Promise<MultiStageSkuMatch> {
  const queries = buildPriceRefreshQueryVariants(stored);
  const productId = parseSku(stored.externalProductId).productId;
  const scoredBySku = new Map<string, SkuCandidateScore>();
  let rateLimited: CatalogSearchResult | undefined;

  for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
    const query = queries[queryIndex]!;
    const result = queryIndex === 1 && lookupByProductId
      ? await lookupByProductId(productId)
      : await search(query);
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
    if (queryIndex === 0 && best && best.score >= 70 && !lookupByProductId) {
      // 상세 후보 조회가 없으면 추가 호출보다 관리자·수집기 검토가 안전합니다.
      break;
    }
    // 1차 결과가 없거나 약한 경우에만 상품 ID 기반 공식 재조회를 허용합니다.
  }

  const candidates = Array.from(scoredBySku.values()).sort((left, right) => right.score - left.score);
    return { exact: null, best: candidates[0] ?? null, candidates, queries, rateLimited };
}
