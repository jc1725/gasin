# 비수집기 상품용 5단계 SKU 매칭 예시

아래 예시는 가신의 현재 `productId:itemId:vendorItemId` 식별 방식과 쿠팡 Search API의 상품 URL 기반 SKU 추출 방식을 전제로 합니다. 핵심 원칙은 **productId만 같다는 이유로 자동 갱신하지 않고**, 저장된 옵션 정보와 API 후보의 URL·상품명을 함께 검증한 뒤 신뢰도가 충분할 때만 반영하는 것입니다.

## 1. 타입과 정책 상수

```ts
// server/multiStageSkuMatcher.ts
import type { CoupangProduct } from "./coupang";

export type StoredSkuProduct = {
  id: number;
  externalProductId: string; // productId:itemId:vendorItemId
  name: string;
  variantLabel: string | null;
  unitLabel: string | null;
  quantity: number | null;
  packSize: string | null;
  isRocket: boolean;
  isFreeShipping: boolean;
};

export type Candidate = CoupangProduct & {
  externalProductId: string;
  itemId: string | null;
  vendorItemId: string | null;
};

export type ScoredCandidate = Candidate & {
  score: number;
  reasons: string[];
  exactSku: boolean;
  autoMatchable: boolean;
};

export type MatchDecision =
  | { kind: "exact"; candidate: ScoredCandidate; query: string }
  | { kind: "safe_candidate"; candidate: ScoredCandidate; query: string }
  | { kind: "review"; candidates: ScoredCandidate[]; query: string }
  | { kind: "not_found"; candidates: ScoredCandidate[]; query: string };

const MAX_QUERIES_PER_PRODUCT = 4;
const MAX_CANDIDATES_PER_QUERY = 10;
const MAX_KEYWORD_LENGTH = 50;
const SAFE_SCORE = 82;
const MIN_SCORE_MARGIN = 12;
```

## 2. 식별자·검색어·옵션 정규화

```ts
function compact(value: string | null | undefined) {
  return value?.replace(/\\s+/g, " ").trim() ?? "";
}

function normalizeText(value: string | null | undefined) {
  return compact(value)
    .toLowerCase()
    .replace(/[(),/·|:+_-]/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function normalizeComparable(value: string | null | undefined) {
  return normalizeText(value).replace(/\\s/g, "");
}

function parseStoredSku(externalProductId: string) {
  const [productId, itemId, vendorItemId] = externalProductId.split(":");
  return { productId, itemId: itemId ?? null, vendorItemId: vendorItemId ?? null };
}

function parseCandidateSku(product: CoupangProduct): Candidate {
  let itemId: string | null = null;
  let vendorItemId: string | null = null;
  try {
    const url = new URL(product.productUrl);
    itemId = url.searchParams.get("itemId");
    vendorItemId = url.searchParams.get("vendorItemId");
  } catch {
    // URL이 비정상인 후보는 아래 점수화에서 식별자 점수를 받을 수 없습니다.
  }

  return {
    ...product,
    externalProductId: itemId && vendorItemId
      ? `${product.productId}:${itemId}:${vendorItemId}`
      : `${product.productId}:url-only`,
    itemId,
    vendorItemId,
  };
}

function extractMeasurements(product: StoredSkuProduct) {
  const text = [product.name, product.variantLabel, product.unitLabel, product.packSize]
    .filter(Boolean)
    .join(" ");
  const capacityTokens = [...text.matchAll(/(\\d+(?:\\.\\d+)?)\\s*(ml|mL|l|L|g|kg|mg|cm|mm|인치|호)/g)]
    .map(match => `${match[1]}${match[2].toLowerCase()}`);
  const quantityTokens = [
    ...(Number.isInteger(product.quantity) && (product.quantity ?? 0) > 0 ? [`${product.quantity}개`] : []),
    ...[...text.matchAll(/(\\d+)\\s*(개입|개|팩|세트|매|봉|롤|캔|병)/g)].map(match => `${match[1]}${match[2]}`),
  ];
  return {
    capacityTokens: [...new Set(capacityTokens)],
    quantityTokens: [...new Set(quantityTokens)],
  };
}

function buildQueryVariants(product: StoredSkuProduct) {
  const measurements = extractMeasurements(product);
  const name = compact(product.name).replace(/[,·].*$/, "");
  const brandAndName = compact(product.name).split(/\\s+/).slice(0, 8).join(" ");
  const option = compact(product.variantLabel);
  const sizeAndQuantity = [...measurements.capacityTokens, ...measurements.quantityTokens].join(" ");

  const candidates = [
    [name, sizeAndQuantity].filter(Boolean).join(" "),
    [brandAndName, sizeAndQuantity].filter(Boolean).join(" "),
    [name, option].filter(Boolean).join(" "),
    name,
  ];

  return [...new Set(candidates)]
    .map(query => query.slice(0, MAX_KEYWORD_LENGTH).trim())
    .filter(Boolean)
    .slice(0, MAX_QUERIES_PER_PRODUCT);
}
```

검색어는 50자 제한을 넘기지 않도록 마지막에 자릅니다. 긴 상품명 전체를 무조건 앞에서 자르면 용량·수량이 잘릴 수 있으므로, 첫 번째와 두 번째 검색어에는 옵션 토큰을 앞쪽에 배치하는 것이 중요합니다.

## 3. 후보 점수화

```ts
function tokenSet(value: string) {
  return new Set(normalizeText(value).split(" ").filter(token => token.length >= 2));
}

function overlapRatio(expected: Set<string>, actual: Set<string>) {
  if (expected.size === 0) return 0;
  let matched = 0;
  for (const token of expected) if (actual.has(token)) matched += 1;
  return matched / expected.size;
}

function scoreCandidate(product: StoredSkuProduct, candidate: Candidate): ScoredCandidate {
  const storedSku = parseStoredSku(product.externalProductId);
  const measurements = extractMeasurements(product);
  const expectedName = tokenSet(product.name);
  const actualName = tokenSet(candidate.productName);
  const reasons: string[] = [];
  let score = 0;

  if (String(candidate.productId) === storedSku.productId) {
    score += 32;
    reasons.push("productId 일치");
  }
  if (candidate.itemId && candidate.itemId === storedSku.itemId) {
    score += 28;
    reasons.push("itemId 일치");
  }
  if (candidate.vendorItemId && candidate.vendorItemId === storedSku.vendorItemId) {
    score += 28;
    reasons.push("vendorItemId 일치");
  }

  const nameOverlap = overlapRatio(expectedName, actualName);
  if (nameOverlap >= 0.8) {
    score += 18;
    reasons.push(`상품명 토큰 ${Math.round(nameOverlap * 100)}% 일치`);
  } else if (nameOverlap >= 0.55) {
    score += 10;
    reasons.push(`상품명 토큰 ${Math.round(nameOverlap * 100)}% 부분 일치`);
  }

  const candidateText = normalizeComparable(candidate.productName);
  const capacityMatched = measurements.capacityTokens.length === 0
    || measurements.capacityTokens.some(token => candidateText.includes(normalizeComparable(token)));
  const quantityMatched = measurements.quantityTokens.length === 0
    || measurements.quantityTokens.some(token => candidateText.includes(normalizeComparable(token)));

  if (capacityMatched && measurements.capacityTokens.length > 0) {
    score += 10;
    reasons.push("용량·규격 일치");
  }
  if (quantityMatched && measurements.quantityTokens.length > 0) {
    score += 10;
    reasons.push("수량·포장 단위 일치");
  }
  if (candidate.isRocket || candidate.isFreeShipping) {
    score += 2;
    reasons.push("로켓·무료배송 후보");
  }

  const exactSku = candidate.externalProductId === product.externalProductId;
  if (exactSku) reasons.unshift("productId·itemId·vendorItemId 전체 일치");

  // productId만 일치하거나 용량·수량이 빠진 후보는 자동 승인하지 않습니다.
  const hasStoredOptionEvidence = measurements.capacityTokens.length > 0 || measurements.quantityTokens.length > 0;
  const optionEvidenceMatched = (!measurements.capacityTokens.length || capacityMatched)
    && (!measurements.quantityTokens.length || quantityMatched);
  const autoMatchable = exactSku || (
    score >= SAFE_SCORE
    && String(candidate.productId) === storedSku.productId
    && hasStoredOptionEvidence
    && optionEvidenceMatched
    && Boolean(candidate.itemId && candidate.vendorItemId)
  );

  return { ...candidate, score, reasons, exactSku, autoMatchable };
}
```

실제 운영에서는 후보 상품명에 용량·수량이 표시되지 않는 상품도 있으므로, 점수만 높다고 자동 승인하면 안 됩니다. 저장 옵션 정보가 있는 상품은 옵션 증거가 하나라도 빠진 경우 `review`로 보내는 편이 안전합니다.

## 4. 5단계 검색과 최종 판정

```ts
type SearchFn = (keyword: string, limit: number) => Promise<CoupangProduct[]>;

export async function matchSkuWithFiveStages(
  product: StoredSkuProduct,
  search: SearchFn,
): Promise<MatchDecision> {
  const queries = buildQueryVariants(product);
  const allCandidates = new Map<string, Candidate>();
  const storedSku = parseStoredSku(product.externalProductId);

  // 1~3단계: 서로 다른 검색어를 순차 호출해 API 결과 누락 가능성을 줄입니다.
  for (const query of queries) {
    const results = await search(query, MAX_CANDIDATES_PER_QUERY);
    for (const result of results) {
      const candidate = parseCandidateSku(result);
      allCandidates.set(candidate.externalProductId, candidate);
    }

    // 이미 전체 SKU가 발견되면 추가 호출하지 않고 즉시 확정합니다.
    const exact = [...allCandidates.values()].find(candidate =>
      String(candidate.productId) === storedSku.productId
      && candidate.itemId === storedSku.itemId
      && candidate.vendorItemId === storedSku.vendorItemId,
    );
    if (exact) {
      const scored = scoreCandidate(product, exact);
      return { kind: "exact", candidate: scored, query };
    }
  }

  // 4단계: 모든 후보를 점수화합니다.
  const scored = [...allCandidates.values()]
    .map(candidate => scoreCandidate(product, candidate))
    .sort((left, right) => right.score - left.score);

  if (scored.length === 0) return { kind: "not_found", candidates: [], query: queries[0] ?? product.name };

  // 5단계: 최고 후보와 2위 후보의 점수 차이를 확인해 자동 오인을 방지합니다.
  const best = scored[0];
  const second = scored[1];
  const margin = second ? best.score - second.score : best.score;
  if (best.autoMatchable && margin >= MIN_SCORE_MARGIN) {
    return { kind: "safe_candidate", candidate: best, query: queries[0] ?? product.name };
  }

  return { kind: "review", candidates: scored.slice(0, 5), query: queries[0] ?? product.name };
}
```

## 5. 가격 갱신 작업에서의 사용 예시

```ts
export async function refreshOneProduct(
  product: StoredSkuProduct,
  search: SearchFn,
) {
  const decision = await matchSkuWithFiveStages(product, search);

  if (decision.kind === "exact" || decision.kind === "safe_candidate") {
    const matched = decision.candidate;
    return {
      action: "update" as const,
      productId: product.id,
      price: matched.productPrice,
      matchedSku: matched.externalProductId,
      score: matched.score,
      reasons: matched.reasons,
      query: decision.query,
    };
  }

  if (decision.kind === "review") {
    return {
      action: "review" as const,
      productId: product.id,
      query: decision.query,
      candidates: decision.candidates.map(candidate => ({
        externalProductId: candidate.externalProductId,
        productId: candidate.productId,
        productName: candidate.productName,
        score: candidate.score,
        reasons: candidate.reasons,
      })),
    };
  }

  return {
    action: "awaiting_collection" as const,
    productId: product.id,
    query: decision.query,
    reason: "여러 검색어에서도 정확 SKU 후보를 찾지 못했습니다.",
  };
}
```

`action: update`인 경우에도 실제 DB 반영 전에 다음을 다시 검사하는 것을 권장합니다.

```ts
if (result.action === "update") {
  const [productId, itemId, vendorItemId] = result.matchedSku.split(":");
  if (!productId || !itemId || !vendorItemId) throw new Error("SKU가 완전하지 않아 반영하지 않습니다.");

  // 기존 DB helper를 통해 currentPrice·priceHistory를 함께 저장합니다.
  // 단순히 currentPrice만 update하지 말고 기존 가격 이력 저장 경로를 재사용합니다.
  await db.applyOfficialPriceRefresh({
    productId: result.productId,
    matchedSku: { productId, itemId, vendorItemId },
    price: result.price,
    searchKeyword: result.query,
    score: result.score,
    reasons: result.reasons,
  });
}
```

## 운영 적용 시 주의점

첫째, 호출 제한 때문에 한 상품당 최대 4개 검색어만 순차 사용하고, 여러 상품을 병렬 호출하지 않습니다. 둘째, `productId`만 일치하는 후보는 자동 반영하지 않습니다. 셋째, 용량·수량 정보가 저장되어 있지 않은 상품은 점수화보다 먼저 `review` 또는 수집기 확인 대기로 보내야 합니다. 넷째, 각 검색어와 후보 SKU·점수·탈락 사유를 실행 로그에 남겨야 다음에 API 미일치 원인을 확인할 수 있습니다.

이 예시에서 `safe_candidate`는 쿠팡 API가 저장된 `itemId`·`vendorItemId`를 그대로 돌려주지 않았지만, 같은 `productId`와 용량·수량을 가진 후보가 하나뿐이고 점수 차이가 충분한 경우입니다. 이 경우에도 기존 SKU를 조용히 덮어쓰지 말고, **새 SKU로 변경된 사실과 근거를 별도 로그에 남긴 뒤** 정책에 따라 자동 승인하거나 관리자 검토로 보내야 합니다.
