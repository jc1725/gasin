import * as db from "./db";
import { getCoupangVariantKey, searchCoupangProducts } from "./coupang";
import type { CoupangProduct } from "./coupang";
import { CoupangRateLimitError } from "./coupangRateLimit";
import type { CoupangApiCallType } from "./coupangRateLimit";
import { buildSearchKeywordVariants, filterStableDeliveryResults, hasFullKeywordMatch, rankSearchResults } from "./searchRelevance";
import { notifySearchQuotaExceeded } from "./searchQuotaAlert";
import { isExcludedTrackingCategory } from "./categoryEligibility";
import { describeProductVariant } from "./productVariant";

export type CatalogSearchResult = {
  products: Awaited<ReturnType<typeof db.listProducts>>;
  source: "cache" | "database" | "coupang" | "rate_limited";
  retryAt?: Date;
  limitReason?: "minute-limit" | "emergency-block";
  message?: string;
};

/**
 * 방문자가 검색만 해도 관련 상품이 통째로 영구 저장되어 가격 추적 목록이 무작위로
 * 계속 늘어나는 문제를 막기 위한 "지연 등록" 결과 항목입니다. id가 아직 없고,
 * 실제로 상세 페이지를 열거나 찜하는 시점에만 materializeSearchResult로 진짜
 * 저장(가격 추적 시작)됩니다. 원본 쿠팡 응답을 다시 찾을 수 있는 최소 식별 정보
 * (pendingMaterialize)만 들고 있습니다.
 */
export type EphemeralSearchProduct = {
  id: null;
  externalProductId: string;
  name: string;
  imageUrl: string;
  affiliateUrl: string;
  categoryName: string | null;
  currentPrice: number;
  lowestPrice: number;
  variantLabel: string | null;
  unitPrice: number | null;
  unitLabel: string | null;
  quantity: number | null;
  packSize: null;
  source: "search";
  isRocket: boolean;
  isFreeShipping: boolean;
  inStock: true;
  pendingMaterialize: { keyword: string; productId: number; productUrl: string };
};

export type LazyCatalogSearchResult = {
  products: Array<CatalogSearchResult["products"][number] | EphemeralSearchProduct>;
  source: CatalogSearchResult["source"];
  retryAt?: Date;
  limitReason?: "minute-limit" | "emergency-block";
  message?: string;
};

type RawSearchCacheEntry = { expiresAt: number; results: CoupangProduct[] };
/** 재검색 시 쿠팡 API를 다시 부르지 않도록 원본 응답을 잠시 들고 있는 시간입니다. */
const RAW_SEARCH_CACHE_TTL_MS = 20 * 60 * 1000;
const RAW_SEARCH_CACHE_MAX_ENTRIES = 500;
const rawSearchResultCache = new Map<string, RawSearchCacheEntry>();

function normalizeRawCacheKey(keyword: string) {
  return keyword.trim().toLowerCase();
}

function cacheRawSearchResults(keyword: string, results: CoupangProduct[]) {
  const key = normalizeRawCacheKey(keyword);
  rawSearchResultCache.delete(key);
  rawSearchResultCache.set(key, { expiresAt: Date.now() + RAW_SEARCH_CACHE_TTL_MS, results });
  while (rawSearchResultCache.size > RAW_SEARCH_CACHE_MAX_ENTRIES) {
    const oldestKey = rawSearchResultCache.keys().next().value;
    if (oldestKey === undefined) break;
    rawSearchResultCache.delete(oldestKey);
  }
}

function getCachedRawSearchResults(keyword: string): CoupangProduct[] | undefined {
  const key = normalizeRawCacheKey(keyword);
  const entry = rawSearchResultCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    rawSearchResultCache.delete(key);
    return undefined;
  }
  return entry.results;
}

function toEphemeralSearchProduct(keyword: string, item: CoupangProduct): EphemeralSearchProduct {
  const variant = describeProductVariant(item.productName, item.productPrice, item.categoryName ?? null);
  return {
    id: null,
    externalProductId: getCoupangVariantKey(item),
    name: item.productName,
    imageUrl: item.productImage,
    affiliateUrl: item.productUrl,
    categoryName: item.categoryName ?? null,
    currentPrice: item.productPrice,
    lowestPrice: item.productPrice,
    variantLabel: variant.variantLabel,
    unitPrice: variant.unitPrice,
    unitLabel: variant.unitLabel,
    quantity: variant.quantity,
    packSize: null,
    source: "search",
    isRocket: Boolean(item.isRocket),
    isFreeShipping: Boolean(item.isFreeShipping),
    inStock: true,
    pendingMaterialize: { keyword, productId: item.productId, productUrl: item.productUrl },
  };
}

/**
 * 검색 결과 카드를 실제로 열거나 찜할 때만 호출됩니다. 클라이언트가 보낸
 * productId·productUrl은 신뢰하지 않고, 그 검색어로 서버가 직접 캐시해둔 원본
 * 쿠팡 응답에서 일치하는 항목을 찾아 그 데이터로만 저장합니다 — 캐시가
 * 만료되었거나 일치하는 항목이 없으면 null을 반환해 다시 검색하도록 합니다.
 */
export async function materializeSearchResult(keyword: string, identity: { productId: number; productUrl: string }) {
  const cached = getCachedRawSearchResults(keyword);
  if (!cached) return null;
  const targetKey = getCoupangVariantKey(identity);
  const match = cached.find(item => item.productId === identity.productId && getCoupangVariantKey(item) === targetKey);
  if (!match) return null;
  return db.upsertCoupangProduct(match, "search");
}

function isStoredCoupangAffiliateUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.toLowerCase() === "link.coupang.com";
  } catch {
    return false;
  }
}

function hasUsableStoredPrice(products: CatalogSearchResult["products"]) {
  return products.some(product => product.inStock !== false && Number(product.currentPrice) > 0);
}

async function reuseAffiliateUrlsFromSearch(stored: Awaited<ReturnType<typeof db.upsertCoupangProducts>>) {
  const ready = stored.filter(product => isStoredCoupangAffiliateUrl(product.affiliateUrl));
  await Promise.all(ready.map(product => db.saveDeepLinkForProduct(product.id, product.affiliateUrl)));
  return ready.length;
}

const MIN_STORED_RESULTS_BEFORE_EXTERNAL_SEARCH = 3;

function removeExcludedTrackingProducts<T extends { categoryName?: string | null; name?: string; productName?: string }>(products: T[]) {
  return products.filter(product => !isExcludedTrackingCategory({ categoryName: product.categoryName, name: product.name, productName: product.productName }));
}

/**
 * 사용자가 같은 검색어를 다시 검색하면 프런트엔드가 "새로고침"으로 보고 refresh: true를
 * 보내고, 이는 forceExternal로 이어져 캐시·DB 커버리지 판단(hasFullKeywordMatch 포함,
 * 위 세 차례의 수정 전부)을 완전히 건너뛴 채 라이브 쿠팡 검색 API 결과만으로 응답한다.
 * 문제는 쿠팡 자체 검색 랭킹이 가신 수집기로 등록한 낱개 상품보다 묶음/세트 상품을
 * 훨씬 우선하는 경우가 흔하다는 것 — 그러면 방금 전 첫 검색에서는 보이던 정확한 상품이
 * "다시 검색"을 누르는 순간 사라진다. forceExternal이어도 이미 추적 중인 완전 일치
 * 상품이 있다면 라이브 응답에서 사라지지 않도록 별도로 확인해 되살린다.
 */
async function findExactTrackedMatchForForcedRefresh(keyword: string, limit: number) {
  const trackedMatches = removeExcludedTrackingProducts(rankSearchResults(keyword, await db.searchTrackedProducts(keyword, limit)));
  return trackedMatches.find(product => hasFullKeywordMatch(keyword, [product]) && hasUsableStoredPrice([product]));
}

export async function searchCatalogSafely(keyword: string, limit?: number, options?: { forceExternal?: boolean; callType?: CoupangApiCallType; persistNewResults?: true }): Promise<CatalogSearchResult>;
export async function searchCatalogSafely(keyword: string, limit: number | undefined, options: { forceExternal?: boolean; callType?: CoupangApiCallType; persistNewResults: false }): Promise<LazyCatalogSearchResult>;
export async function searchCatalogSafely(keyword: string, limit = 10, options: { forceExternal?: boolean; callType?: CoupangApiCallType; persistNewResults?: boolean } = {}): Promise<CatalogSearchResult | LazyCatalogSearchResult> {
  const callType = options.callType ?? "product-search";
  const persistNewResults = options.persistNewResults ?? true;
  let databaseFallback: CatalogSearchResult["products"] = [];
  if (!options.forceExternal) {
    const cached = await db.findCachedSearchProducts(keyword);
    if (cached !== undefined) {
      const rankedCached = removeExcludedTrackingProducts(filterStableDeliveryResults(rankSearchResults(keyword, cached), keyword));
      const cacheIsUsable = rankedCached.length > 0 && hasUsableStoredPrice(rankedCached);
      if (cacheIsUsable && hasFullKeywordMatch(keyword, rankedCached)) {
        return { products: rankedCached, source: "cache", message: "검색어와 일치하는 저장 결과를 표시합니다." };
      }
      if (cacheIsUsable) {
        // 캐시에 결과가 있어도 검색어 핵심 토큰과 완전히 일치하는 상품이 그 안에
        // 없을 수 있다. 이 캐시는 최대 12시간(cacheSearchProducts TTL) 동안 이후의
        // 모든 동일 검색어 요청에서 DB·외부 API 로직보다 먼저 반환되므로, 그 사이
        // 가신 수집기로 정확히 일치하는 상품이 새로 저장돼도(또는 이번처럼 관련
        // 로직이 배포로 수정돼도) 캐시가 만료되기 전까지는 계속 예전 결과만
        // 보여주는 사고가 난다. 캐시를 맹신하기 전에 저장 목록에 완전 일치 상품이
        // 있는지 한 번 더 확인하고, 있다면 그 결과로 캐시를 즉시 갱신한다.
        const freshMatches = removeExcludedTrackingProducts(filterStableDeliveryResults(rankSearchResults(keyword, await db.searchTrackedProducts(keyword, limit)), keyword));
        if (hasFullKeywordMatch(keyword, freshMatches) && hasUsableStoredPrice(freshMatches)) {
          await db.invalidateCachedSearchProducts(keyword);
          await db.cacheSearchProducts(keyword, freshMatches.map(product => product.id));
          return { products: freshMatches, source: "database", message: "가격 추적 목록에서 찾은 최신 결과로 캐시를 갱신했습니다." };
        }
        return { products: rankedCached, source: "cache", message: "검색어와 일치하는 저장 결과를 표시합니다." };
      }
      // 가격 데이터가 없는 캐시와 무관한 이전 응답은 최신 가격을 확인할 수 없다.
      // 다음 허용된 검색에서 즉시 공식 API를 한 번 조회하도록 제거한다.
      await db.invalidateCachedSearchProducts(keyword);
    }

    const databaseMatches = await db.searchTrackedProducts(keyword, limit);
    const rankedDatabaseMatches = removeExcludedTrackingProducts(filterStableDeliveryResults(rankSearchResults(keyword, databaseMatches), keyword));
    // 가신 수집기로 등록된 상품처럼 DB에 1~2개만 저장돼 있어도, 검색어 전체가
    // 상품명에 그대로 들어맞는 결과를 이미 찾았다면 "저장 결과가 부족하다"고
    // 보지 않는다. 그렇지 않으면 매번 외부 쿠팡 API를 호출해, API가 반환하는
    // 느슨하게만 관련된 결과가 이미 찾은 정확한 저장 상품을 완전히 대체해 버린다.
    const hasSufficientStoredCoverage = rankedDatabaseMatches.length >= Math.min(limit, MIN_STORED_RESULTS_BEFORE_EXTERNAL_SEARCH)
      || (databaseMatches.length > rankedDatabaseMatches.length && rankedDatabaseMatches.length > 0)
      || hasFullKeywordMatch(keyword, rankedDatabaseMatches);
    if (hasSufficientStoredCoverage && hasUsableStoredPrice(rankedDatabaseMatches)) {
      return { products: rankedDatabaseMatches, source: "database", message: "가격 추적 목록에서 찾은 결과입니다." };
    }
    // 저장 결과가 적으면 한두 개만으로 검색을 끝내지 않고 공식 API로 보완한다.
    // API가 결과를 주지 않을 때는 이미 저장된 관련 상품을 fallback으로 유지한다.
    databaseFallback = rankedDatabaseMatches.length > 0 && hasUsableStoredPrice(rankedDatabaseMatches)
      ? rankedDatabaseMatches
      : [];
  }

  try {
    let searchKeyword = keyword;
    // 지연 등록 모드에서는 방금 저장한 짧은 TTL 원본 캐시가 있으면 쿠팡 API를 다시
    // 부르지 않고 그대로 재사용한다(재검색으로 인한 불필요한 API 호출 방지).
    const cachedRaw = !persistNewResults && !options.forceExternal ? getCachedRawSearchResults(keyword) : undefined;
    let results = cachedRaw ?? await searchCoupangProducts(searchKeyword, limit, callType);
    let relevantResults = removeExcludedTrackingProducts(filterStableDeliveryResults(rankSearchResults(searchKeyword, results), searchKeyword));
    // 사용자 검색에서만, 1차 결과가 없거나 무관할 때 검색어 표기 변형을 한 번 보완합니다.
    // 가격 추적 작업은 상위 호출부의 SKU matcher가 호출 횟수를 통제합니다.
    if (relevantResults.length === 0 && callType === "product-search") {
      const fallbackKeyword = buildSearchKeywordVariants(keyword).find(variant => variant !== keyword.trim());
      if (fallbackKeyword) {
        searchKeyword = fallbackKeyword;
        results = await searchCoupangProducts(searchKeyword, limit, callType);
        relevantResults = removeExcludedTrackingProducts(filterStableDeliveryResults(rankSearchResults(searchKeyword, results), searchKeyword));
      }
    }
    const shouldProtectTrackedExactMatch = callType === "product-search" && options.forceExternal === true;

    if (relevantResults.length === 0) {
      // 쿠팡이 검색어와 무관한 기본 상품을 반환하는 경우가 있다. 이런 응답은
      // 가격 추적 목록과 검색 캐시에 남기지 않고, 다음 검색에서 다시 공식 조회할 수 있게 한다.
      await db.invalidateCachedSearchProducts(keyword);
      const exactTrackedMatch = shouldProtectTrackedExactMatch ? await findExactTrackedMatchForForcedRefresh(keyword, limit) : undefined;
      if (exactTrackedMatch) {
        return { products: [exactTrackedMatch], source: "database", message: "쿠팡 최신 검색 결과가 없어 추적 중인 정확한 상품을 표시합니다." };
      }
      if (databaseFallback.length > 0) {
        return {
          products: databaseFallback,
          source: "database",
          message: "쿠팡 최신 검색 결과가 없어 저장된 관련 상품을 표시합니다.",
        };
      }
      if (callType === "product-search") await db.recordMissingSearch(keyword);
      return {
        products: [],
        source: "coupang",
        message: results.length > 0
          ? "쿠팡 공식 API가 검색어와 무관한 결과만 반환해 저장하지 않았습니다. 잠시 후 다시 검색해 주세요."
          : "쿠팡 최신 검색 결과에 검색어와 일치하는 상품이 없습니다.",
      };
    }

    if (!persistNewResults) {
      // 실제로 방문자가 클릭(상세 열람·찜)하기 전에는 DB에 아무것도 남기지 않는다.
      // 재검색 시 쿠팡 API를 또 부르지 않도록 원본 응답만 짧게 캐시해 둔다.
      cacheRawSearchResults(keyword, relevantResults);
      const ephemeral: LazyCatalogSearchResult["products"] = relevantResults.map(item => toEphemeralSearchProduct(keyword, item));
      if (shouldProtectTrackedExactMatch) {
        const exactTrackedMatch = await findExactTrackedMatchForForcedRefresh(keyword, limit);
        if (exactTrackedMatch && !ephemeral.some(item => item.externalProductId === exactTrackedMatch.externalProductId)) {
          ephemeral.unshift(exactTrackedMatch);
        }
      }
      if (ephemeral.length === 0 && callType === "product-search") await db.recordMissingSearch(keyword);
      return {
        products: ephemeral,
        source: "coupang",
        message: ephemeral.length > 0
          ? (options.forceExternal ? "쿠팡 공식 API로 최신 검색 결과를 새로 확인했습니다." : "쿠팡 최신 검색 결과 중 검색어와 일치하는 상품을 표시합니다.")
          : "쿠팡 최신 검색 결과에 검색어와 일치하는 상품이 없습니다.",
      };
    }

    const stored = await db.upsertCoupangProducts(relevantResults, "search");
    let ranked = removeExcludedTrackingProducts(filterStableDeliveryResults(rankSearchResults(keyword, stored), keyword));
    if (shouldProtectTrackedExactMatch) {
      const exactTrackedMatch = await findExactTrackedMatchForForcedRefresh(keyword, limit);
      if (exactTrackedMatch && !ranked.some(product => product.externalProductId === exactTrackedMatch.externalProductId)) {
        ranked = [exactTrackedMatch, ...ranked];
      }
    }
    await reuseAffiliateUrlsFromSearch(ranked);
    await db.cacheSearchProducts(keyword, ranked.map(product => product.id));
    if (ranked.length === 0 && callType === "product-search") await db.recordMissingSearch(keyword);
    return {
      products: ranked,
      source: "coupang",
      message: ranked.length > 0
        ? (options.forceExternal ? "쿠팡 공식 API로 최신 검색 결과를 새로 확인했습니다." : "쿠팡 최신 검색 결과 중 검색어와 일치하는 상품을 표시합니다.")
        : "쿠팡 최신 검색 결과에 검색어와 일치하는 상품이 없습니다.",
    };
  } catch (error) {
    if (error instanceof CoupangRateLimitError) {
      await db.recordCoupangRateLimitEvent("search", error.reason, error.retryAt);
      void notifySearchQuotaExceeded({ reason: error.reason, retryAt: error.retryAt });
      return {
        products: [],
        source: "rate_limited",
        retryAt: error.retryAt,
        limitReason: error.reason === "minute-limit" ? "minute-limit" : "emergency-block",
        message: `쿠팡 전체 API 보호 모드(${error.reason})로 외부 검색을 ${error.retryAt.toISOString()}까지 멈췄습니다.`,
      };
    }
    const detail = error instanceof Error ? error.message : "Coupang search failed";
    if (detail.includes("403")) {
      await db.blockSearchApiUntil(new Date(Date.now() + 24 * 60 * 60 * 1000), detail);
    }
    throw error;
  }
}
