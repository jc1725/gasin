import * as db from "./db";
import { searchCoupangProducts } from "./coupang";
import { CoupangRateLimitError } from "./coupangRateLimit";
import type { CoupangApiCallType } from "./coupangRateLimit";
import { buildSearchKeywordVariants, filterStableDeliveryResults, rankSearchResults } from "./searchRelevance";
import { notifySearchQuotaExceeded } from "./searchQuotaAlert";
import { isExcludedTrackingCategory } from "./categoryEligibility";

export type CatalogSearchResult = {
  products: Awaited<ReturnType<typeof db.listProducts>>;
  source: "cache" | "database" | "coupang" | "rate_limited";
  retryAt?: Date;
  limitReason?: "minute-limit" | "emergency-block";
  message?: string;
};

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

export async function searchCatalogSafely(keyword: string, limit = 10, options: { forceExternal?: boolean; callType?: CoupangApiCallType } = {}): Promise<CatalogSearchResult> {
  const callType = options.callType ?? "product-search";
  let databaseFallback: CatalogSearchResult["products"] = [];
  if (!options.forceExternal) {
    const cached = await db.findCachedSearchProducts(keyword);
    if (cached !== undefined) {
      const rankedCached = removeExcludedTrackingProducts(filterStableDeliveryResults(rankSearchResults(keyword, cached)));
      if (rankedCached.length > 0 && hasUsableStoredPrice(rankedCached)) {
        return { products: rankedCached, source: "cache", message: "검색어와 일치하는 저장 결과를 표시합니다." };
      }
      // 가격 데이터가 없는 캐시와 무관한 이전 응답은 최신 가격을 확인할 수 없다.
      // 다음 허용된 검색에서 즉시 공식 API를 한 번 조회하도록 제거한다.
      await db.invalidateCachedSearchProducts(keyword);
    }

    const databaseMatches = await db.searchTrackedProducts(keyword, limit);
    const rankedDatabaseMatches = removeExcludedTrackingProducts(filterStableDeliveryResults(rankSearchResults(keyword, databaseMatches)));
    const hasSufficientStoredCoverage = rankedDatabaseMatches.length >= Math.min(limit, MIN_STORED_RESULTS_BEFORE_EXTERNAL_SEARCH)
      || (databaseMatches.length > rankedDatabaseMatches.length && rankedDatabaseMatches.length > 0);
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
    let results = await searchCoupangProducts(searchKeyword, limit, callType);
    let relevantResults = removeExcludedTrackingProducts(filterStableDeliveryResults(rankSearchResults(searchKeyword, results)));
    // 사용자 검색에서만, 1차 결과가 없거나 무관할 때 검색어 표기 변형을 한 번 보완합니다.
    // 가격 추적 작업은 상위 호출부의 SKU matcher가 호출 횟수를 통제합니다.
    if (relevantResults.length === 0 && callType === "product-search") {
      const fallbackKeyword = buildSearchKeywordVariants(keyword).find(variant => variant !== keyword.trim());
      if (fallbackKeyword) {
        searchKeyword = fallbackKeyword;
        results = await searchCoupangProducts(searchKeyword, limit, callType);
        relevantResults = removeExcludedTrackingProducts(filterStableDeliveryResults(rankSearchResults(searchKeyword, results)));
      }
    }
    if (relevantResults.length === 0) {
      // 쿠팡이 검색어와 무관한 기본 상품을 반환하는 경우가 있다. 이런 응답은
      // 가격 추적 목록과 검색 캐시에 남기지 않고, 다음 검색에서 다시 공식 조회할 수 있게 한다.
      await db.invalidateCachedSearchProducts(keyword);
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
    const stored = await db.upsertCoupangProducts(relevantResults, "search");
    const ranked = removeExcludedTrackingProducts(filterStableDeliveryResults(rankSearchResults(keyword, stored)));
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
