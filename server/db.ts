import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lt, lte, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  categoryBestProducts,
  collectedPriceHistory,
  favorites,
  googleDriveConnections,
  InsertUser,
  manualLinkTracks,
  priceAlertLogs,
  priceHistory,
  priceTrackingMetrics,
  productCandidates,
  productRequests,
  products,
  scheduleSettings,
  searchApiQuotas,
  searchCaches,
  searchEvents,
  smartstoreHotDeals,
  missingSearches,
  syncRuns,
  targetPriceAlertLogs,
  userConfirmedPrices,
  users,
  webPushSubscriptions,
} from "../drizzle/schema";
import { getCoupangVariantKey, type CoupangProduct } from "./coupang";
import { describeProductVariant, getProductFamilyKey } from "./productVariant";
import type { ParsedCoupangLink } from "./manualLink";
import { decideSearchQuota, SEARCH_API_MAX_CALLS_PER_MINUTE, type SearchQuotaSnapshot } from "./searchQuota";
import { COUPANG_TRACKING_MAX_CALLS_PER_MINUTE, decideCoupangRateLimit, type CoupangApiCallType, type CoupangRateLimitSnapshot } from "./coupangRateLimit";
import { buildDeepLinkUpdate, buildManualLookupFailureUpdate, buildManualTrackUpdate, buildProductViewUpdate } from "./trackingState";
import type { CandidateCsvRow } from "./candidateCsv";
import type { UserConfirmedPriceCsvRow } from "./userConfirmedPriceCsv";
import type { AdminOptionCsvRow } from "./adminOptionCsv";
import { ENV } from './_core/env';
import { createHash } from "node:crypto";
import { selectCheapestPerFamilyUnit, selectRepresentativesPerFamily } from "./productDedupe";
import { getSafeMergeDirection, listSafeMergeCandidates } from "./productMerge";
import { buildPriceRefreshStats } from "./priceRefreshStats";
import { getSearchTokenVariants, getSearchTokens, rankSearchResults } from "./searchRelevance";
import { buildSearchSuggestions } from "./searchSuggestions";
import { summarizeExternalCronQueue } from "./externalCronQueue";
import { chooseTrackedPrice, hasWowMemberPrice } from "./wowMemberPrice";
import { isFreshExtensionAlertObservation } from "./extensionAlertObservation";
import { classifyMissingSearch } from "./searchFailureClassification";
import { isExcludedTrackingCategory, getExcludedTrackingCategory, EXCLUDED_TRACKING_CATEGORY_LABEL } from "./categoryEligibility";
import { buildCollectorProductMetadata, hasMissingCollectorMetadata } from "./collectorMetadata";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/** 공개 가이드에 표시하는 검증 가능한 서비스 규모 지표입니다. */
export async function getPublicServiceStats() {
  const db = await getDb();
  if (!db) return { activeTrackedProducts: 0, priceObservations: 0, collectorObservations: 0 };

  const [activeProducts, priceRecords, collectorRecords] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(products).where(eq(products.isActive, true)),
    db.select({ count: sql<number>`count(*)` }).from(priceHistory),
    db.select({ count: sql<number>`count(*)` }).from(collectedPriceHistory),
  ]);

  return {
    activeTrackedProducts: Number(activeProducts[0]?.count ?? 0),
    priceObservations: Number(priceRecords[0]?.count ?? 0),
    collectorObservations: Number(collectorRecords[0]?.count ?? 0),
  };
}

export type CollectedPriceInput = {
  productId: string;
  itemId?: string;
  vendorItemId?: string;
  name: string;
  brand: string;
  price?: number;
  inStock: boolean;
  url: string;
  imageUrl?: string;
  optionName?: string;
  capacityText?: string;
  quantity?: number;
  pageType: string;
  source: string;
  collectedAt: Date;
};

export type CollectedProductUpsertSummary = {
  created: number;
  updated: number;
  stale: number;
  priceHistoryAdded: number;
};

export type WebPushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type StoredWebPushSubscription = WebPushSubscriptionInput & { id: number; userId: number };

export type DeferredSearchRecheckMissOutcome = "awaiting_collection" | "collector_trusted";

/** 정확 SKU의 최근 확장 수집 관측은 공식 검색 미발견보다 우선하는 실제 판매 상태 신호다. */
export function hasTrustedExtensionSkuObservation(
  product: Pick<typeof products.$inferSelect, "inStock" | "wowMemberPrice" | "wowMemberPriceObservedAt">,
  now = new Date(),
) {
  const observedAt = product.wowMemberPriceObservedAt;
  return product.inStock === true
    && Number(product.wowMemberPrice ?? 0) > 0
    && observedAt !== null
    && observedAt.getTime() >= now.getTime() - 7 * 24 * 60 * 60 * 1000;
}

function getWebPushEndpointHash(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex");
}

/** MySQL 드라이버 ResultSetHeader에서 영향받은 행 수를 안전하게 추출한다. */
function getAffectedRows(result: unknown): number {
  return Number((result as [{ affectedRows?: number }] | undefined)?.[0]?.affectedRows ?? 0);
}

export async function upsertWebPushSubscription(userId: number, subscription: WebPushSubscriptionInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const endpointHash = getWebPushEndpointHash(subscription.endpoint);
  await db.insert(webPushSubscriptions).values({ userId, endpointHash, ...subscription }).onDuplicateKeyUpdate({
    set: { userId, endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth, updatedAt: new Date() },
  });
  return { endpointHash };
}

export async function listWebPushSubscriptionsForUser(userId: number): Promise<StoredWebPushSubscription[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: webPushSubscriptions.id, userId: webPushSubscriptions.userId, endpoint: webPushSubscriptions.endpoint, p256dh: webPushSubscriptions.p256dh, auth: webPushSubscriptions.auth })
    .from(webPushSubscriptions)
    .where(eq(webPushSubscriptions.userId, userId));
}

export async function removeWebPushSubscription(userId: number, endpoint: string) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.delete(webPushSubscriptions).where(and(eq(webPushSubscriptions.userId, userId), eq(webPushSubscriptions.endpointHash, getWebPushEndpointHash(endpoint))));
  return getAffectedRows(result) > 0;
}

export async function removeWebPushSubscriptionsByIds(ids: number[]) {
  if (ids.length === 0) return 0;
  const db = await getDb();
  if (!db) return 0;
  const result = await db.delete(webPushSubscriptions).where(inArray(webPushSubscriptions.id, ids));
  return getAffectedRows(result);
}

/** 수집 관측은 같은 가격이어도 다른 collectedAt을 가진 시계열 데이터이므로 항상 보존한다. */
export function shouldStoreCollectedPrice(_previousPrice: number | undefined, _nextPrice: number | undefined) {
  return true;
}

function getCoupangOptionIdsFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      itemId: parsed.searchParams.get("itemId")?.trim() || undefined,
      vendorItemId: parsed.searchParams.get("vendorItemId")?.trim() || undefined,
    };
  } catch {
    return {};
  }
}

/** productId만으로는 여러 옵션이 섞일 수 있어, 식별 가능한 경우 정확 옵션 SKU를 사용한다. */
export function getCollectedProductKey(item: Pick<CollectedPriceInput, "productId" | "itemId" | "vendorItemId" | "url">) {
  const urlIds = getCoupangOptionIdsFromUrl(item.url);
  const itemId = item.itemId?.trim() || urlIds.itemId;
  const vendorItemId = item.vendorItemId?.trim() || urlIds.vendorItemId;
  if (itemId && vendorItemId) return `${item.productId}:${itemId}:${vendorItemId}`;
  if (vendorItemId) return `${item.productId}:vendor:${vendorItemId}`;
  return item.productId;
}

/** 수집기가 별도 필드로 보낸 정확 SKU를 쿠팡 원본 URL에도 반영해 딥링크 생성 시 다른 옵션을 막는다. */
export function getCollectedExactSkuUrl(item: Pick<CollectedPriceInput, "productId" | "itemId" | "vendorItemId" | "url">) {
  const urlIds = getCoupangOptionIdsFromUrl(item.url);
  const itemId = item.itemId?.trim() || urlIds.itemId;
  const vendorItemId = item.vendorItemId?.trim() || urlIds.vendorItemId;
  if (!itemId || !vendorItemId) return item.url;
  try {
    const url = new URL(item.url);
    if (!["coupang.com", "www.coupang.com", "m.coupang.com"].includes(url.hostname.toLowerCase())) return item.url;
    url.searchParams.set("itemId", itemId);
    url.searchParams.set("vendorItemId", vendorItemId);
    return url.toString();
  } catch {
    return item.url;
  }
}

const GENERIC_COLLECTION_OPTION_TOKENS = new Set([
  "옵션", "개당", "중량", "수량", "구성", "선택", "맛", "색상", "사이즈", "용량", "입", "팩", "박스", "세트", "냉동", "해동", "상온", "오픈숙성", "인덕션",
]);
const REJECTED_COLLECTION_OPTION_TOKENS = ["보증", "케어", "할부", "효율", "등급", "측정", "인증", "특허", "정품", "구성품"];

function getComparableKoreanTokens(value: string) {
  return (value.toLocaleLowerCase("ko-KR").match(/[가-힣a-z]{2,}/g) ?? [])
    .filter(token => !GENERIC_COLLECTION_OPTION_TOKENS.has(token));
}

/** 수집기가 이전 페이지의 옵션 텍스트를 보내는 경우, 다른 상품의 구성 정보가 현재 SKU를 덮어쓰지 않도록 막는다. */
export function isCollectedOptionMetadataCompatible(productName: string, optionName: string | null) {
  if (!optionName) return true;
  if (REJECTED_COLLECTION_OPTION_TOKENS.some(token => optionName.includes(token))) return false;
  const productTokens = new Set(getComparableKoreanTokens(productName));
  const optionTokens = getComparableKoreanTokens(optionName);
  if (optionTokens.length === 0) return true;
  // "혼합색상 × 20cm × 1개"처럼 구성만 담긴 짧은 옵션은 제품명과 단어를 공유하지 않아도
  // 안전하다. 반면 세 개 이상의 고유 단어로 된 문장형 옵션은 다른 상품명일 가능성이 높으므로
  // 현재 상품명과 의미 있는 단어를 공유할 때만 적용한다.
  if (optionTokens.length < 3) return true;
  return optionTokens.some(token => productTokens.has(token));
}

/** `30개입, 2개` 같은 2단계 옵션에서 포장 단위만 따로 보관한다. 실제 구매 수량은 별도 quantity를 우선한다. */
export function extractPackSizeFromOptionName(optionName: string | null | undefined) {
  const match = optionName?.match(/(?:^|[\s·,/(])(\d{1,6})\s*(개입|팩입|매입|장입|포입|정입|봉입)(?![가-힣])/i);
  return match ? `${match[1]}${match[2]}` : null;
}

type CollectorPriorityCandidate = Pick<typeof products.$inferSelect, "externalProductId" | "source" | "isActive" | "refreshState" | "deepLinkStatus">;

/** 같은 상품 페이지의 대기·실패 검색 SKU는 수집기가 새로 확인한 정확 SKU보다 우선할 수 없다. */
export function isSupersededSearchSkuForCollector(candidate: CollectorPriorityCandidate, collectorSku: string) {
  const [collectorProductId, , collectorVendorItemId] = collectorSku.split(":");
  const [candidateProductId, , candidateVendorItemId] = candidate.externalProductId.split(":");
  return Boolean(collectorProductId && collectorVendorItemId)
    && collectorSku !== candidate.externalProductId
    && collectorProductId === candidateProductId
    && collectorVendorItemId === candidateVendorItemId
    && candidate.isActive
    && (candidate.source === "search" || candidate.source === "goldbox");
}

/**
 * source 상품의 즐겨찾기·카테고리 베스트 노출을 target 상품으로 이관한다.
 * 동일 사용자·카테고리 충돌은 target 항목으로 병합하고 source 항목을 제거한다.
 */
async function transferFavoritesAndCategoryEntries(tx: any, sourceProductId: number, targetProductId: number) {
  const [sourceFavorites, targetFavorites, sourceCategories, targetCategories] = await Promise.all([
    tx.select().from(favorites).where(eq(favorites.productId, sourceProductId)),
    tx.select().from(favorites).where(eq(favorites.productId, targetProductId)),
    tx.select().from(categoryBestProducts).where(eq(categoryBestProducts.productId, sourceProductId)),
    tx.select().from(categoryBestProducts).where(eq(categoryBestProducts.productId, targetProductId)),
  ]);

  let movedFavorites = 0;
  let combinedFavorites = 0;
  for (const sourceFavorite of sourceFavorites) {
    const targetFavorite = targetFavorites.find((favorite: typeof sourceFavorite) => favorite.userId === sourceFavorite.userId);
    if (!targetFavorite) {
      await tx.update(favorites).set({ productId: targetProductId }).where(eq(favorites.id, sourceFavorite.id));
      targetFavorites.push({ ...sourceFavorite, productId: targetProductId });
      movedFavorites += 1;
    } else {
      await tx.update(favorites).set({
        targetPrice: targetFavorite.targetPrice ?? sourceFavorite.targetPrice,
        targetPriceVersion: Math.max(targetFavorite.targetPriceVersion, sourceFavorite.targetPriceVersion),
      }).where(eq(favorites.id, targetFavorite.id));
      await tx.delete(favorites).where(eq(favorites.id, sourceFavorite.id));
      combinedFavorites += 1;
    }
  }

  const targetCategoryIds = new Set(targetCategories.map((category: typeof sourceCategories[number]) => category.categoryId));
  let movedCategoryEntries = 0;
  for (const sourceCategory of sourceCategories) {
    if (targetCategoryIds.has(sourceCategory.categoryId)) {
      await tx.delete(categoryBestProducts).where(eq(categoryBestProducts.id, sourceCategory.id));
    } else {
      await tx.update(categoryBestProducts).set({ productId: targetProductId }).where(eq(categoryBestProducts.id, sourceCategory.id));
      targetCategoryIds.add(sourceCategory.categoryId);
      movedCategoryEntries += 1;
    }
  }

  return { movedFavorites, combinedFavorites, movedCategoryEntries };
}

/**
 * 검색 API 매칭 실패로 대기 중이던(search 출처, refreshState가 awaiting_collection·
 * deferred인) 상품이 가신 수집기 관측으로 실제 해소되는 순간을 "가격 추적 성과
 * 모니터링" 대시보드에 즉시 기록한다. 이 기록이 없으면 다음 예약 검색 재확인
 * 배치가 같은 상품을 우연히 다시 처리할 때까지 성과 통계에 반영되지 않아
 * "보류 SKU 평균 해소" 시간이 실제 해소 시점보다 부풀려져 표시된다.
 */
async function recordCollectorResolutionMetric(
  tx: any,
  before: { id: number; source: string; refreshState: string } | undefined,
  occurredAt: Date,
) {
  if (!before || before.source !== "search") return;
  if (before.refreshState !== "awaiting_collection" && before.refreshState !== "deferred") return;
  await tx.insert(priceTrackingMetrics).values({
    productId: before.id,
    runId: null,
    source: "search",
    outcome: "collector_resolved",
    apiCalls: 0,
    durationMs: 0,
    occurredAt,
  });
}

/**
 * 수집기가 실제로 확인한 정확 SKU로 대기·실패 검색 SKU의 사용자 연결만 이관하고,
 * 기존 가격 이력은 원본 SKU 감사 이력으로 남긴 뒤 원본 행을 비활성화한다.
 */
async function supersedeSearchSkusWithCollectorObservation(tx: any, collectorProductId: number, collectorSku: string, occurredAt: Date) {
  const [pageProductId, , collectorVendorItemId] = collectorSku.split(":");
  if (!pageProductId || !collectorVendorItemId) return 0;
  const candidates = await tx.select().from(products).where(and(
    eq(products.isActive, true),
    or(eq(products.source, "search"), eq(products.source, "goldbox")),
    ne(products.id, collectorProductId),
    like(products.externalProductId, `${pageProductId}:%:${collectorVendorItemId}`),
  ));
  const superseded = candidates.filter((candidate: CollectorPriorityCandidate) => isSupersededSearchSkuForCollector(candidate, collectorSku));

  for (const source of superseded) {
    await recordCollectorResolutionMetric(tx, source, occurredAt);
    await transferFavoritesAndCategoryEntries(tx, source.id, collectorProductId);
    await Promise.all([
      tx.update(userConfirmedPrices).set({ productId: collectorProductId }).where(eq(userConfirmedPrices.productId, source.id)),
      tx.update(priceAlertLogs).set({ productId: collectorProductId }).where(eq(priceAlertLogs.productId, source.id)),
      tx.update(targetPriceAlertLogs).set({ productId: collectorProductId }).where(eq(targetPriceAlertLogs.productId, source.id)),
      tx.update(manualLinkTracks).set({ productId: collectorProductId }).where(eq(manualLinkTracks.productId, source.id)),
    ]);
    await tx.update(products).set({
      isActive: false,
      lastRefreshReason: `가신 수집기 정확 SKU ${collectorSku} 관측 우선 적용 · 상품 #${collectorProductId}로 사용자 연결 이관`,
    }).where(eq(products.id, source.id));
  }
  return superseded.length;
}

/**
 * 품절 화면에서는 쿠팡 옵션 선택기가 사라져 itemId·vendorItemId를 읽을 수 없는 경우가 있다.
 * 이때 상품 페이지 자체의 품절 관측은 같은 페이지의 아직 검증되지 않은 검색 SKU에 적용한다.
 * 단, 더 최근 관측이 있는 SKU와 수집기가 이미 확인한 collection SKU는 변경하지 않는다.
 */
async function applyPageSoldOutToUnverifiedSearchSkus(tx: any, item: CollectedPriceInput, collectorSku: string) {
  if (item.inStock || collectorSku !== item.productId) return 0;
  const candidates = await tx.select().from(products).where(and(
    eq(products.isActive, true),
    eq(products.inStock, true),
    eq(products.source, "search"),
    like(products.externalProductId, `${item.productId}:%`),
    or(
      eq(products.refreshState, "awaiting_collection"),
      eq(products.refreshState, "deferred"),
      eq(products.deepLinkStatus, "failed"),
    ),
  ));
  const olderCandidates = candidates.filter((candidate: typeof products.$inferSelect) => candidate.lastSeenAt.getTime() <= item.collectedAt.getTime());
  for (const candidate of olderCandidates) {
    await tx.update(products).set({
      inStock: false,
      refreshState: "fresh",
      lastRefreshAttemptAt: null,
      nextRefreshAt: null,
      lastSeenAt: item.collectedAt,
      lastRefreshReason: "가신 수집기 상품 페이지 품절 관측 (옵션 ID 미확인)",
    }).where(eq(products.id, candidate.id));
  }
  return olderCandidates.length;
}

export async function recordCollectedPriceItems(items: CollectedPriceInput[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.transaction(async tx => {
    let stored = 0;
    let skipped = 0;
    const productsSummary: CollectedProductUpsertSummary = { created: 0, updated: 0, stale: 0, priceHistoryAdded: 0 };
    const alertProductIds = new Set<number>();
    const pendingDeepLinkProductIds = new Set<number>();
    for (const item of items) {
      if (isExcludedTrackingCategory({ pageType: item.pageType, name: item.name })) {
        skipped += 1;
        console.info(`[Tracking] ${EXCLUDED_TRACKING_CATEGORY_LABEL} 수집 관측을 저장하지 않습니다: ${item.name}`);
        continue;
      }
      const optionIds = getCoupangOptionIdsFromUrl(item.url);
      const effectiveItemId = item.itemId?.trim() || optionIds.itemId;
      const effectiveVendorItemId = item.vendorItemId?.trim() || optionIds.vendorItemId;
      const vendorOnlyObservation = !effectiveItemId && Boolean(effectiveVendorItemId);
      const collectionKey = getCollectedProductKey(item);
      const collectedExactSkuUrl = getCollectedExactSkuUrl(item);
      const collectionName = item.name.trim() || `수집 상품 ${item.productId}`;
      const receivedOptionName = item.optionName?.trim() || null;
      const collectedOptionIsCompatible = isCollectedOptionMetadataCompatible(collectionName, receivedOptionName);
      const optionName = collectedOptionIsCompatible ? receivedOptionName : null;
      const capacityText = collectedOptionIsCompatible ? item.capacityText?.trim() || null : null;
      const quantity = collectedOptionIsCompatible && Number.isSafeInteger(item.quantity) && (item.quantity ?? 0) > 0 ? item.quantity! : null;
      const packSize = extractPackSizeFromOptionName(optionName);
      const effectivePrice = Number.isSafeInteger(item.price) && (item.price ?? 0) > 0 ? item.price! : 0;
      const collectionVariant = describeProductVariant(`${collectionName} ${optionName ?? ""}`, effectivePrice, item.pageType);
      const collectionFamilyKey = getProductFamilyKey(collectionName) ?? `collection:${item.productId}`;
      await tx.insert(collectedPriceHistory).values({
        externalProductId: collectionKey,
        itemId: item.itemId?.trim() || optionIds.itemId || null,
        vendorItemId: item.vendorItemId?.trim() || optionIds.vendorItemId || null,
        name: collectionName,
        brand: item.brand,
        price: effectivePrice || null,
        url: collectedExactSkuUrl,
        imageUrl: item.imageUrl?.trim() || null,
        optionName,
        capacityText,
        quantity,
        packSize,
        inStock: item.inStock,
        pageType: item.pageType,
        source: item.source,
        collectedAt: item.collectedAt,
      });
      stored += 1;

      // 장바구니처럼 vendorItemId만 있는 관측은 참고 이력으로만 보관하고,
      // itemId가 확보될 때까지 기존 상품의 현재가·알림·딥링크를 갱신하지 않는다.
      if (vendorOnlyObservation) continue;

      const current = (await tx.select().from(products).where(eq(products.externalProductId, collectionKey)).limit(1))[0];
      if (!current) {
        // 과거 Search API가 pageKey만 저장한 상품은 정확한 옵션을 선택할 수 없어
        // 24시간마다 같은 SKU 미일치가 반복될 수 있다. 수집기가 한 번이라도
        // itemId/vendorItemId를 전달하면 해당 단일 레거시 행을 정확 SKU로 승격한다.
        const canPromoteLegacySearchProduct = collectionKey !== item.productId;
        const legacySearchProduct = canPromoteLegacySearchProduct
          ? (await tx.select().from(products).where(and(
            eq(products.externalProductId, item.productId),
            eq(products.source, "search"),
            eq(products.isActive, true),
          )).limit(2))[0]
          : undefined;
        if (legacySearchProduct) {
          await recordCollectorResolutionMetric(tx, legacySearchProduct, item.collectedAt);
          const legacyMetadata = {
            externalProductId: collectionKey,
            name: collectionName || legacySearchProduct.name,
            affiliateUrl: collectedExactSkuUrl || legacySearchProduct.affiliateUrl,
            imageUrl: item.imageUrl?.trim() || legacySearchProduct.imageUrl,
            categoryName: item.pageType || legacySearchProduct.categoryName,
            familyKey: collectionFamilyKey,
            variantLabel: collectedOptionIsCompatible && optionName ? optionName : legacySearchProduct.variantLabel,
            unitPrice: collectedOptionIsCompatible ? collectionVariant.unitPrice ?? legacySearchProduct.unitPrice : legacySearchProduct.unitPrice,
            unitLabel: collectedOptionIsCompatible && capacityText ? capacityText : legacySearchProduct.unitLabel,
            quantity: collectedOptionIsCompatible && quantity ? quantity : legacySearchProduct.quantity,
            packSize: collectedOptionIsCompatible && packSize ? packSize : legacySearchProduct.packSize,
            optionMetadataSource: collectedOptionIsCompatible ? "collection" as const : legacySearchProduct.optionMetadataSource,
            source: "collection" as const,
            refreshState: "fresh" as const,
            lastRefreshReason: item.inStock ? "가신 수집기 SKU 승격 관측" : "가신 수집기 SKU 승격 품절 관측",
            lastRefreshAttemptAt: null,
            nextRefreshAt: null,
            lastSeenAt: item.collectedAt,
            inStock: item.inStock,
            ...(item.inStock && effectivePrice > 0 ? { wowMemberPrice: effectivePrice, wowMemberPriceObservedAt: item.collectedAt } : {}),
          };
          if (!item.inStock || effectivePrice <= 0) {
            await tx.update(products).set(legacyMetadata).where(eq(products.id, legacySearchProduct.id));
          } else {
            const priceChanged = legacySearchProduct.currentPrice !== effectivePrice;
            await tx.update(products).set({
              ...legacyMetadata,
              currentPrice: effectivePrice,
              lowestPrice: legacySearchProduct.lowestPrice > 0 ? Math.min(legacySearchProduct.lowestPrice, effectivePrice) : effectivePrice,
            }).where(eq(products.id, legacySearchProduct.id));
            if (priceChanged) {
              await tx.insert(priceHistory).values({ productId: legacySearchProduct.id, price: effectivePrice, recordedAt: item.collectedAt });
              productsSummary.priceHistoryAdded += 1;
            }
          }
          await supersedeSearchSkusWithCollectorObservation(tx, legacySearchProduct.id, collectionKey, item.collectedAt);
          productsSummary.updated += 1;
          if (item.inStock && effectivePrice > 0 && legacySearchProduct.deepLinkStatus === "failed") pendingDeepLinkProductIds.add(legacySearchProduct.id);
          if (item.inStock && effectivePrice > 0) alertProductIds.add(legacySearchProduct.id);
          continue;
        }
        let created: { id: number } | undefined;
        try {
          [created] = await tx.insert(products).values({
            externalProductId: collectionKey,
            name: collectionName,
            imageUrl: item.imageUrl?.trim() ?? "",
            affiliateUrl: collectedExactSkuUrl,
            categoryName: item.pageType || null,
            familyKey: collectionFamilyKey,
            variantLabel: collectedOptionIsCompatible ? optionName ?? collectionVariant.variantLabel ?? "가신 수집기 상품" : null,
            unitPrice: collectedOptionIsCompatible ? collectionVariant.unitPrice : null,
            unitLabel: collectedOptionIsCompatible ? capacityText ?? collectionVariant.unitLabel : null,
            quantity: collectedOptionIsCompatible ? quantity : null,
            packSize: collectedOptionIsCompatible ? packSize : null,
            optionMetadataSource: "collection",
            trackingPriority: "normal",
            deepLinkUrl: null,
            deepLinkStatus: "pending",
            deepLinkFailureReason: null,
            deepLinkUpdatedAt: null,
            lastViewedAt: null,
            refreshState: "fresh",
            lastRefreshReason: item.inStock ? "가신 수집기 자동 등록" : "가신 수집기 품절 관측",
            currentPrice: effectivePrice,
            wowMemberPrice: effectivePrice || null,
            wowMemberPriceObservedAt: effectivePrice > 0 ? item.collectedAt : null,
            lowestPrice: effectivePrice,
            inStock: item.inStock,
            source: "collection",
            isRocket: false,
            isFreeShipping: false,
            isActive: true,
            firstSeenAt: item.collectedAt,
            lastSeenAt: item.collectedAt,
          }).$returningId();
        } catch (error) {
          // 같은 상품을 다른 /api/collect 요청(동시 배치 전송, 수동 동기화 + 5분
          // 자동 동기화 겹침 등)이 이 트랜잭션보다 먼저 커밋해 externalProductId
          // 유니크 제약을 위반한 경우입니다. 전체 배치를 500으로 실패시키지 않고
          // 방금 생성된 행을 찾아 최신 관측치로 반영한 뒤 계속 진행합니다.
          const isDuplicateKey = (error as { code?: string; errno?: number } | null)?.code === "ER_DUP_ENTRY"
            || (error as { code?: string; errno?: number } | null)?.errno === 1062;
          if (!isDuplicateKey) throw error;
          const [raced] = await tx.select().from(products).where(eq(products.externalProductId, collectionKey)).limit(1);
          if (!raced) throw error; // 예상치 못한 상태이면 원래 오류를 그대로 전파합니다.
          const racedLatestObservationAt = raced.wowMemberPriceObservedAt ?? raced.lastSeenAt;
          if (effectivePrice > 0 && item.collectedAt.getTime() > racedLatestObservationAt.getTime()) {
            const priceChanged = raced.currentPrice !== effectivePrice;
            await tx.update(products).set({
              currentPrice: effectivePrice,
              lowestPrice: raced.lowestPrice > 0 ? Math.min(raced.lowestPrice, effectivePrice) : effectivePrice,
              inStock: item.inStock,
              lastSeenAt: item.collectedAt,
              ...(item.inStock ? { wowMemberPrice: effectivePrice, wowMemberPriceObservedAt: item.collectedAt } : {}),
            }).where(eq(products.id, raced.id));
            if (priceChanged) {
              await tx.insert(priceHistory).values({ productId: raced.id, price: effectivePrice, recordedAt: item.collectedAt });
              productsSummary.priceHistoryAdded += 1;
            }
            if (item.inStock && effectivePrice > 0) alertProductIds.add(raced.id);
          } else {
            await tx.update(products).set({ lastSeenAt: item.collectedAt }).where(eq(products.id, raced.id));
          }
          productsSummary.updated += 1;
          continue;
        }
        if (created?.id) {
          if (item.inStock && effectivePrice > 0) pendingDeepLinkProductIds.add(created.id);
          if (effectivePrice > 0) {
            await tx.insert(priceHistory).values({ productId: created.id, price: effectivePrice, recordedAt: item.collectedAt });
            productsSummary.priceHistoryAdded += 1;
            alertProductIds.add(created.id);
          }
          await supersedeSearchSkusWithCollectorObservation(tx, created.id, collectionKey, item.collectedAt);
          await applyPageSoldOutToUnverifiedSearchSkus(tx, item, collectionKey);
        }
        productsSummary.created += 1;
        continue;
      }

      const latestPriceObservationAt = current.wowMemberPriceObservedAt ?? current.lastSeenAt;
      if (item.collectedAt.getTime() <= latestPriceObservationAt.getTime()) {
        // 확장 프로그램이 전송 재시도할 때 collectedAt이 같을 수 있다. 이 경우에도
        // 같은 정확 SKU의 유효 관측이면 파트너스 API 미발견으로 남은 실패 딥링크를
        // 다시 생성 대기로 복구한다. 가격·옵션은 더 최신 관측이 아니므로 덮어쓰지 않는다.
        const canRecoverFailedLinkFromRetriedObservation = item.inStock
          && effectivePrice > 0
          && current.deepLinkStatus === "failed"
          && Boolean(collectedExactSkuUrl);
        if (canRecoverFailedLinkFromRetriedObservation) {
          await recordCollectorResolutionMetric(tx, current, item.collectedAt);
          await tx.update(products).set({
            affiliateUrl: collectedExactSkuUrl,
            deepLinkStatus: "pending",
            deepLinkUrl: null,
            deepLinkFailureReason: null,
            deepLinkUpdatedAt: new Date(),
            refreshState: "fresh",
            lastRefreshReason: "가신 수집기 재전송 관측으로 정확 SKU 구매 경로를 복구 대기 처리",
          }).where(eq(products.id, current.id));
          pendingDeepLinkProductIds.add(current.id);
          productsSummary.updated += 1;
          continue;
        }
        productsSummary.stale += 1;
        continue;
      }
      await recordCollectorResolutionMetric(tx, current, item.collectedAt);
      const canReplaceMetadata = collectedOptionIsCompatible && (current.optionMetadataSource === "collection" || !current.variantLabel || !current.unitLabel || !current.quantity);
      const latestMetadata = {
        name: collectionName || current.name,
        affiliateUrl: collectedExactSkuUrl || current.affiliateUrl,
        imageUrl: item.imageUrl?.trim() || current.imageUrl,
        categoryName: item.pageType || current.categoryName,
        familyKey: collectionFamilyKey,
        variantLabel: optionName && canReplaceMetadata ? optionName : current.variantLabel,
        unitPrice: effectivePrice > 0 && collectionVariant.unitPrice !== null && canReplaceMetadata ? collectionVariant.unitPrice : current.unitPrice,
        unitLabel: capacityText && canReplaceMetadata ? capacityText : current.unitLabel,
        quantity: quantity && canReplaceMetadata ? quantity : current.quantity,
        packSize: packSize && canReplaceMetadata ? packSize : current.packSize,
        optionMetadataSource: canReplaceMetadata && (optionName || capacityText || quantity || packSize) ? "collection" as const : current.optionMetadataSource,
        lastSeenAt: item.collectedAt,
        inStock: item.inStock,
        refreshState: "fresh" as const,
        lastRefreshAttemptAt: null,
        nextRefreshAt: null,
        lastRefreshReason: item.inStock ? (current.inStock ? "가신 수집기 최신 관측 반영" : "가신 수집기 재입고 관측") : "가신 수집기 품절 관측",
        // 공식 검색이 아닌 실제 상품 화면에서 같은 itemId·vendorItemId를 다시 관측한 경우에만
        // 실패 링크를 재생성 대기로 되돌린다. 관측 URL 자체를 제휴 딥링크로 재사용하지 않는다.
        ...(current.deepLinkStatus === "failed" ? { deepLinkStatus: "pending" as const, deepLinkUrl: null, deepLinkFailureReason: null, deepLinkUpdatedAt: new Date() } : {}),
        isActive: true,
        ...(item.inStock && effectivePrice > 0 ? { wowMemberPrice: effectivePrice, wowMemberPriceObservedAt: item.collectedAt } : {}),
      };
      if (!item.inStock || effectivePrice <= 0) {
        await tx.update(products).set(latestMetadata).where(eq(products.id, current.id));
        await supersedeSearchSkusWithCollectorObservation(tx, current.id, collectionKey, item.collectedAt);
        await applyPageSoldOutToUnverifiedSearchSkus(tx, item, collectionKey);
        productsSummary.updated += 1;
        continue;
      }
      await tx.update(products).set({
        ...latestMetadata,
        currentPrice: effectivePrice,
        lowestPrice: current.lowestPrice > 0 ? Math.min(current.lowestPrice, effectivePrice) : effectivePrice,
      }).where(eq(products.id, current.id));
      await supersedeSearchSkusWithCollectorObservation(tx, current.id, collectionKey, item.collectedAt);
      const duplicateObservation = (await tx
        .select({ id: priceHistory.id })
        .from(priceHistory)
        .where(and(eq(priceHistory.productId, current.id), eq(priceHistory.price, effectivePrice), eq(priceHistory.recordedAt, item.collectedAt)))
        .limit(1)).length > 0;
      if (!duplicateObservation) {
        await tx.insert(priceHistory).values({ productId: current.id, price: effectivePrice, recordedAt: item.collectedAt });
        productsSummary.priceHistoryAdded += 1;
      }
      productsSummary.updated += 1;
      if (item.inStock && effectivePrice > 0 && current.deepLinkStatus === "failed") pendingDeepLinkProductIds.add(current.id);
      if (item.inStock && effectivePrice > 0) alertProductIds.add(current.id);
    }
    return { stored, skipped, products: productsSummary, alertProductIds: Array.from(alertProductIds), pendingDeepLinkProductIds: Array.from(pendingDeepLinkProductIds) };
  });
}

export async function listCollectedPriceHistory(productId: string, since?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db
    .select({
      productId: collectedPriceHistory.externalProductId,
      itemId: collectedPriceHistory.itemId,
      vendorItemId: collectedPriceHistory.vendorItemId,
      name: collectedPriceHistory.name,
      brand: collectedPriceHistory.brand,
      price: collectedPriceHistory.price,
      url: collectedPriceHistory.url,
      imageUrl: collectedPriceHistory.imageUrl,
      optionName: collectedPriceHistory.optionName,
      capacityText: collectedPriceHistory.capacityText,
      quantity: collectedPriceHistory.quantity,
      packSize: collectedPriceHistory.packSize,
      inStock: collectedPriceHistory.inStock,
      pageType: collectedPriceHistory.pageType,
      collectedAt: collectedPriceHistory.collectedAt,
    })
    .from(collectedPriceHistory)
    .where(since ? and(eq(collectedPriceHistory.externalProductId, productId), gte(collectedPriceHistory.collectedAt, since)) : eq(collectedPriceHistory.externalProductId, productId))
    .orderBy(asc(collectedPriceHistory.collectedAt), asc(collectedPriceHistory.id));
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
}

export async function listMembersForAdmin(limit = 500) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    loginMethod: users.loginMethod,
    role: users.role,
    isSuspended: users.isSuspended,
    suspendedAt: users.suspendedAt,
    suspensionEndsAt: users.suspensionEndsAt,
    suspensionReason: users.suspensionReason,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
  }).from(users)
    .orderBy(desc(users.lastSignedIn), desc(users.createdAt), asc(users.id))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export async function updateUserRoleForAdmin(userId: number, role: "user" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
  return { updated: getAffectedRows(result) > 0 };
}

export async function updateUserSuspensionForAdmin(userId: number, input: { isSuspended: boolean; reason: string | null; endsAt: Date | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.update(users).set({
    isSuspended: input.isSuspended,
    suspendedAt: input.isSuspended ? new Date() : null,
    suspensionEndsAt: input.isSuspended ? input.endsAt : null,
    suspensionReason: input.isSuspended ? input.reason : null,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));
  return { updated: getAffectedRows(result) > 0 };
}

export async function getGoogleDriveConnectionForUser(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(googleDriveConnections).where(eq(googleDriveConnections.userId, userId)).limit(1))[0];
}

export async function getGoogleDriveSnapshotConnection() {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(googleDriveConnections).orderBy(desc(googleDriveConnections.updatedAt)).limit(1))[0];
}

export async function saveGoogleDriveConnection(input: { userId: number; refreshTokenCiphertext: string; folderId: string; snapshotFileId?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const existing = await getGoogleDriveConnectionForUser(input.userId);
  await db.insert(googleDriveConnections).values({
    userId: input.userId,
    refreshTokenCiphertext: input.refreshTokenCiphertext,
    folderId: input.folderId,
    snapshotFileId: input.snapshotFileId ?? existing?.snapshotFileId ?? null,
    candidateCsvFileId: existing?.candidateCsvFileId ?? null,
    userPriceCsvFileId: existing?.userPriceCsvFileId ?? null,
  }).onDuplicateKeyUpdate({
    set: {
      refreshTokenCiphertext: input.refreshTokenCiphertext,
      folderId: input.folderId,
      snapshotFileId: input.snapshotFileId ?? existing?.snapshotFileId ?? null,
      candidateCsvFileId: existing?.candidateCsvFileId ?? null,
      userPriceCsvFileId: existing?.userPriceCsvFileId ?? null,
      updatedAt: new Date(),
    },
  });
  return getGoogleDriveConnectionForUser(input.userId);
}

export async function saveGoogleDriveSnapshotFile(userId: number, snapshotFileId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(googleDriveConnections).set({ snapshotFileId, updatedAt: new Date() }).where(eq(googleDriveConnections.userId, userId));
}

export async function saveGoogleDriveCandidateCsvFile(userId: number, candidateCsvFileId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(googleDriveConnections).set({ candidateCsvFileId, updatedAt: new Date() }).where(eq(googleDriveConnections.userId, userId));
}

export async function saveGoogleDriveUserPriceCsvFile(userId: number, userPriceCsvFileId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(googleDriveConnections).set({ userPriceCsvFileId, updatedAt: new Date() }).where(eq(googleDriveConnections.userId, userId));
}

export async function importUserConfirmedPrices(userId: number, rows: UserConfirmedPriceCsvRow[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  let importedCount = 0;
  let duplicateCount = 0;
  const unmatchedRows: string[] = [];
  for (const row of rows) {
    const ownedProduct = await db
      .select({ id: products.id })
      .from(products)
      .leftJoin(favorites, and(eq(favorites.productId, products.id), eq(favorites.userId, userId)))
      .leftJoin(manualLinkTracks, and(eq(manualLinkTracks.productId, products.id), eq(manualLinkTracks.userId, userId), eq(manualLinkTracks.status, "active")))
      .where(and(eq(products.externalProductId, row.externalProductId), or(eq(favorites.userId, userId), eq(manualLinkTracks.userId, userId))))
      .limit(1);
    const product = ownedProduct[0];
    if (!product) {
      unmatchedRows.push(row.name);
      continue;
    }
    const result = await db.insert(userConfirmedPrices).values({
      userId,
      productId: product.id,
      price: row.price,
      checkedAt: row.checkedAt,
      sourceUrl: row.sourceUrl,
      note: row.note,
      importKey: row.importKey,
    }).onDuplicateKeyUpdate({ set: { importKey: row.importKey } });
    const affectedRows = getAffectedRows(result);
    if (affectedRows === 1) importedCount += 1;
    else duplicateCount += 1;
  }
  return { importedCount, duplicateCount, unmatchedRows };
}

export async function listDeferredProductsForAdmin(limit = 100, options: { imageMissingOnly?: boolean; soldOutOnly?: boolean; awaitingCollectionOnly?: boolean; unmatchedSkuOnly?: boolean; productIds?: number[] } = {}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(products.isActive, true)];
  if (options.productIds) {
    if (options.productIds.length === 0) return [];
    conditions.push(inArray(products.id, options.productIds));
  }
  if (options.soldOutOnly) conditions.push(eq(products.inStock, false));
  else {
    conditions.push(eq(products.inStock, true));
    if (options.imageMissingOnly) conditions.push(or(isNull(products.imageUrl), eq(products.imageUrl, ""))!);
    else if (options.unmatchedSkuOnly) {
      conditions.push(or(eq(products.refreshState, "deferred"), eq(products.refreshState, "awaiting_collection"))!);
      conditions.push(or(like(products.lastRefreshReason, "%정확 SKU%"), like(products.deepLinkFailureReason, "%정확 SKU%"))!);
    } else if (options.awaitingCollectionOnly) conditions.push(eq(products.refreshState, "awaiting_collection"));
    else conditions.push(eq(products.refreshState, "deferred"));
  }
  const rows = await db.select({
    id: products.id,
    externalProductId: products.externalProductId,
    name: products.name,
    imageUrl: products.imageUrl,
    variantLabel: products.variantLabel,
    unitLabel: products.unitLabel,
    currentPrice: products.currentPrice,
    lowestPrice: products.lowestPrice,
    unitPrice: products.unitPrice,
    quantity: products.quantity,
    inStock: products.inStock,
    source: products.source,
    wowMemberPrice: products.wowMemberPrice,
    wowMemberPriceObservedAt: products.wowMemberPriceObservedAt,
    refreshState: products.refreshState,
    lastRefreshReason: products.lastRefreshReason,
    affiliateUrl: products.affiliateUrl,
    deepLinkUrl: products.deepLinkUrl,
    deepLinkStatus: products.deepLinkStatus,
    deepLinkFailureReason: products.deepLinkFailureReason,
    deepLinkUpdatedAt: products.deepLinkUpdatedAt,
    lastSeenAt: products.lastSeenAt,
    lastRefreshAttemptAt: products.lastRefreshAttemptAt,
    nextRefreshAt: products.nextRefreshAt,
  }).from(products).where(and(...conditions)).orderBy(desc(products.lastSeenAt)).limit(Math.min(Math.max(limit, 1), 500));
  if (rows.length === 0) return rows;
  const productIds = rows.map(row => row.id);
  const optionRows = await db.select({ productId: manualLinkTracks.productId, optionLabel: manualLinkTracks.optionLabel })
    .from(manualLinkTracks)
    .where(and(inArray(manualLinkTracks.productId, productIds), ne(manualLinkTracks.optionLabel, "")));
  const optionByProduct = new Map<number, string>();
  for (const row of optionRows) {
    const label = row.optionLabel?.trim();
    if (label && !optionByProduct.has(row.productId as number)) optionByProduct.set(row.productId as number, label);
  }
  return rows.map(row => ({ ...row, variantLabel: row.variantLabel?.trim() || optionByProduct.get(row.id) || null }));
}

/** 목록 페이지 제한과 무관하게 관리자 보류 요약을 계산할 최소 필드만 조회합니다. */
export async function listAllDeferredProductsForAdminSummary() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: products.id,
    source: products.source,
    lastRefreshReason: products.lastRefreshReason,
  }).from(products).where(and(
    eq(products.isActive, true),
    eq(products.inStock, true),
    eq(products.refreshState, "deferred"),
  ));
}

/** 관리자가 보류 상태 상품의 추적을 완전히 제거합니다. 가격 이력·찜은 FK cascade로 삭제됩니다. */
export async function deleteDeferredProductForAdmin(productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.transaction(async tx => {
    const product = (await tx.select({ id: products.id })
      .from(products)
      .where(and(
        eq(products.id, productId),
        eq(products.isActive, true),
        or(eq(products.refreshState, "deferred"), eq(products.refreshState, "awaiting_collection"))!,
      ))
      .limit(1))[0];
    if (!product) return { deleted: false };
    // productId가 NULL로 남아 향후 재활성화되는 것을 막기 위해 수동 링크도 함께 제거합니다.
    await tx.delete(manualLinkTracks).where(eq(manualLinkTracks.productId, productId));
    await tx.delete(products).where(eq(products.id, productId));
    return { deleted: true };
  });
}

/**
 * 관리자가 보류 상품을 품절 처리한다. 가격 이력은 보존하고 일반 목록에서만 제외한다.
 * 공식 수집에서 동일 SKU가 다시 확인되면 upsert 경로가 isActive를 true로 복원한다.
 */
export async function markDeferredProductSoldOutForAdmin(productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.update(products).set({
    inStock: false,
    lastRefreshReason: "관리자 품절 처리",
  }).where(and(
    eq(products.id, productId),
    eq(products.isActive, true),
    or(eq(products.refreshState, "deferred"), eq(products.refreshState, "awaiting_collection"))!,
    eq(products.inStock, true),
  ));
  const affectedRows = getAffectedRows(result);
  return { soldOut: affectedRows === 1 };
}

export async function updateAdminOptionMetadataCsvRows(rows: AdminOptionCsvRow[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const failedLines: number[] = [];
  let updatedCount = 0;
  for (const row of rows) {
    const conditions = [];
    if (row.productId) conditions.push(eq(products.id, row.productId));
    if (row.externalProductId) conditions.push(eq(products.externalProductId, row.externalProductId));
    const match = conditions.length ? await db.select({ id: products.id }).from(products).where(and(eq(products.isActive, true), or(...conditions))).limit(1) : [];
    const product = match[0];
    if (!product) { failedLines.push(row.line); continue; }
    const variantLabel = [row.optionLabel, row.capacity, row.quantity ? `${row.quantity.replace(/개$/, "")}개` : null].filter(Boolean).join(" · ") || null;
    await db.update(products).set({ variantLabel, unitLabel: row.capacity, optionMetadataSource: "manual" }).where(eq(products.id, product.id));
    updatedCount += 1;
  }
  return { updatedCount, failedLines };
}

export async function listMissingOptionMetadataForAdmin(limit = 200) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: products.id,
    name: products.name,
    variantLabel: products.variantLabel,
    unitLabel: products.unitLabel,
    currentPrice: products.currentPrice,
    lastSeenAt: products.lastSeenAt,
  }).from(products)
    .where(and(eq(products.isActive, true), eq(products.inStock, true), isNull(products.variantLabel), ne(products.source, "collection")))
    .orderBy(desc(products.lastSeenAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export async function updateAdminProductOptionMetadata(productId: number, variantLabel: string | null, unitLabel: string | null, quantity: number | null = null) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.update(products).set({ variantLabel, unitLabel, quantity, optionMetadataSource: "manual" }).where(and(eq(products.id, productId), eq(products.isActive, true)));
  return { productId, updated: getAffectedRows(result) > 0 };
}

export async function importAdminConfirmedPrices(userId: number, rows: UserConfirmedPriceCsvRow[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  let importedCount = 0;
  let duplicateCount = 0;
  const unmatchedRows: string[] = [];
  for (const row of rows) {
    const product = (await db.select({ id: products.id }).from(products).where(and(eq(products.externalProductId, row.externalProductId), eq(products.isActive, true))).limit(1))[0];
    if (!product) {
      unmatchedRows.push(row.name);
      continue;
    }
    const result = await db.insert(userConfirmedPrices).values({ userId, productId: product.id, price: row.price, checkedAt: row.checkedAt, sourceUrl: row.sourceUrl, note: row.note, importKey: row.importKey }).onDuplicateKeyUpdate({ set: { importKey: row.importKey } });
    const affectedRows = getAffectedRows(result);
    if (affectedRows === 1) importedCount += 1;
    else duplicateCount += 1;
  }
  return { importedCount, duplicateCount, unmatchedRows };
}

export async function saveAdminConfirmedPrice(userId: number, productId: number, price: number, checkedAt: Date, note: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const product = (await db.select({ id: products.id, affiliateUrl: products.affiliateUrl }).from(products).where(and(eq(products.id, productId), eq(products.isActive, true))).limit(1))[0];
  if (!product) return { matched: false as const };
  const sourceUrl = product.affiliateUrl;
  const importKey = createHash("sha256").update([userId, productId, checkedAt.toISOString(), price, sourceUrl].join("\u001f"), "utf8").digest("hex");
  const result = await db.insert(userConfirmedPrices).values({ userId, productId, price, checkedAt, sourceUrl, note, importKey }).onDuplicateKeyUpdate({ set: { importKey } });
  const affectedRows = getAffectedRows(result);
  return { matched: true as const, importedCount: affectedRows === 1 ? 1 : 0, duplicateCount: affectedRows === 1 ? 0 : 1 };
}

export async function listLatestAdminConfirmedPrices(userId: number, productIds: number[]) {
  if (productIds.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ productId: userConfirmedPrices.productId, price: userConfirmedPrices.price, checkedAt: userConfirmedPrices.checkedAt }).from(userConfirmedPrices).where(and(eq(userConfirmedPrices.userId, userId), inArray(userConfirmedPrices.productId, productIds))).orderBy(desc(userConfirmedPrices.checkedAt));
  return Array.from(new Map(rows.map(row => [row.productId, row])).values());
}

export async function exportAdminPriceHistory(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const productRows = await db.select({
    id: products.id,
    externalProductId: products.externalProductId,
    name: products.name,
    variantLabel: products.variantLabel,
    unitLabel: products.unitLabel,
    currentPrice: products.currentPrice,
    lowestPrice: products.lowestPrice,
    source: products.source,
    refreshState: products.refreshState,
    lastSeenAt: products.lastSeenAt,
  }).from(products).where(eq(products.isActive, true)).orderBy(asc(products.name), asc(products.id));
  if (productRows.length === 0) return [];
  const productIds = productRows.map(product => product.id);
  const historyRows = await db.select({ productId: priceHistory.productId, price: priceHistory.price, recordedAt: priceHistory.recordedAt }).from(priceHistory).where(inArray(priceHistory.productId, productIds)).orderBy(asc(priceHistory.recordedAt));
  const confirmedRows = await db.select({ productId: userConfirmedPrices.productId, price: userConfirmedPrices.price, checkedAt: userConfirmedPrices.checkedAt, note: userConfirmedPrices.note }).from(userConfirmedPrices).where(and(eq(userConfirmedPrices.userId, userId), inArray(userConfirmedPrices.productId, productIds))).orderBy(asc(userConfirmedPrices.checkedAt));
  const productById = new Map(productRows.map(product => [product.id, product]));
  return [
    ...historyRows.map(row => ({ ...productById.get(row.productId)!, historyType: "official" as const, price: row.price, recordedAt: row.recordedAt, note: null })),
    ...confirmedRows.map(row => ({ ...productById.get(row.productId)!, historyType: "admin_confirmed" as const, price: row.price, recordedAt: row.checkedAt, note: row.note })),
  ].sort((left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime() || left.name.localeCompare(right.name, "ko"));
}

export async function listUserConfirmedPricesForProduct(userId: number, productId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(userConfirmedPrices)
    .where(and(eq(userConfirmedPrices.userId, userId), eq(userConfirmedPrices.productId, productId)))
    .orderBy(desc(userConfirmedPrices.checkedAt));
}

export async function listLatestUserConfirmedPricesForFavorites(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ productId: userConfirmedPrices.productId, price: userConfirmedPrices.price, checkedAt: userConfirmedPrices.checkedAt })
    .from(userConfirmedPrices)
    .innerJoin(favorites, and(eq(favorites.productId, userConfirmedPrices.productId), eq(favorites.userId, userId)))
    .where(eq(userConfirmedPrices.userId, userId))
    .orderBy(desc(userConfirmedPrices.checkedAt));
  return Array.from(new Map(rows.map(row => [row.productId, row])).values());
}

export async function listLatestUserConfirmedPricesForOwnedProducts(userId: number, productIds: number[]) {
  if (productIds.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ productId: userConfirmedPrices.productId, price: userConfirmedPrices.price, checkedAt: userConfirmedPrices.checkedAt })
    .from(userConfirmedPrices)
    .leftJoin(favorites, and(eq(favorites.productId, userConfirmedPrices.productId), eq(favorites.userId, userId)))
    .leftJoin(manualLinkTracks, and(eq(manualLinkTracks.productId, userConfirmedPrices.productId), eq(manualLinkTracks.userId, userId), eq(manualLinkTracks.status, "active")))
    .where(and(eq(userConfirmedPrices.userId, userId), inArray(userConfirmedPrices.productId, productIds), or(eq(favorites.userId, userId), eq(manualLinkTracks.userId, userId))))
    .orderBy(desc(userConfirmedPrices.checkedAt));
  return Array.from(new Map(rows.map(row => [row.productId, row])).values());
}

export async function upsertProductCandidates(userId: number, source: "csv_upload" | "drive_csv" | "missing_search", rows: CandidateCsvRow[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  for (const row of rows) {
    await db.insert(productCandidates).values({
      userId,
      source,
      sourceKey: row.sourceKey,
      name: row.name,
      optionLabel: row.optionLabel,
      sourceUrl: row.sourceUrl,
      notes: row.notes,
    }).onDuplicateKeyUpdate({
      set: {
        source,
        name: row.name,
        optionLabel: row.optionLabel,
        sourceUrl: row.sourceUrl,
        notes: row.notes,
        updatedAt: new Date(),
      },
    });
  }
  return rows.length;
}

export async function addMissingSearchCandidate(userId: number, keyword: string) {
  const normalizedKeyword = normalizeSearchKeyword(keyword);
  if (!normalizedKeyword) throw new Error("검색어가 비어 있습니다.");
  const sourceKey = createHash("sha256").update(`missing-search:${normalizedKeyword}`, "utf8").digest("hex");
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const existing = (await db.select({ id: productCandidates.id }).from(productCandidates).where(and(eq(productCandidates.userId, userId), eq(productCandidates.sourceKey, sourceKey))).limit(1))[0];
  await upsertProductCandidates(userId, "missing_search", [{ name: keyword.trim().slice(0, 500), optionLabel: null, sourceUrl: null, notes: "검색 실패 이력에서 등록", sourceKey }]);
  return { created: !existing, sourceKey };
}

export async function listProductCandidates(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(productCandidates).where(eq(productCandidates.userId, userId)).orderBy(desc(productCandidates.updatedAt)).limit(Math.min(Math.max(limit, 1), 100));
}

export async function getProductCandidateForUser(userId: number, candidateId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(productCandidates).where(and(eq(productCandidates.id, candidateId), eq(productCandidates.userId, userId))).limit(1))[0];
}

export async function updateProductCandidateForUser(userId: number, candidateId: number, input: { name: string; optionLabel: string | null; sourceUrl: string | null; notes: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.update(productCandidates).set({
    name: input.name,
    optionLabel: input.optionLabel,
    sourceUrl: input.sourceUrl,
    notes: input.notes,
    updatedAt: new Date(),
  }).where(and(eq(productCandidates.id, candidateId), eq(productCandidates.userId, userId)));
  return result;
}

export async function deleteProductCandidateForUser(userId: number, candidateId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.delete(productCandidates).where(and(eq(productCandidates.id, candidateId), eq(productCandidates.userId, userId)));
}

export type SmartstoreHotDealInput = {
  title: string;
  storeName: string;
  description: string | null;
  imageUrl: string | null;
  purchaseUrl: string;
  regularPrice: number | null;
  salePrice: number;
  isActive: boolean;
  sortOrder: number;
  startsAt: Date | null;
  endsAt: Date | null;
};

/** 스마트스토어 도메인 이외의 외부 구매 링크 등록을 차단합니다. */
export function normalizeSmartstorePurchaseUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("유효한 스마트스토어 HTTPS 링크를 입력해 주세요.");
  }
  const isSmartstoreHost = parsed.hostname === "smartstore.naver.com" || parsed.hostname.endsWith(".smartstore.naver.com");
  if (parsed.protocol !== "https:" || !isSmartstoreHost) {
    throw new Error("스마트스토어(smartstore.naver.com) HTTPS 링크만 등록할 수 있습니다.");
  }
  return parsed.toString();
}

export async function listPublicSmartstoreHotDeals(now = new Date()) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(smartstoreHotDeals)
    .where(and(
      eq(smartstoreHotDeals.isActive, true),
      or(isNull(smartstoreHotDeals.startsAt), lte(smartstoreHotDeals.startsAt, now)),
      or(isNull(smartstoreHotDeals.endsAt), gte(smartstoreHotDeals.endsAt, now)),
    ))
    .orderBy(asc(smartstoreHotDeals.sortOrder), desc(smartstoreHotDeals.createdAt));
}

export async function listSmartstoreHotDealsForAdmin() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(smartstoreHotDeals).orderBy(asc(smartstoreHotDeals.sortOrder), desc(smartstoreHotDeals.createdAt));
}

export async function createSmartstoreHotDeal(userId: number, input: SmartstoreHotDealInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const purchaseUrl = normalizeSmartstorePurchaseUrl(input.purchaseUrl);
  const result = await db.insert(smartstoreHotDeals).values({ ...input, purchaseUrl, createdBy: userId });
  return { id: Number(result[0].insertId) };
}

export async function updateSmartstoreHotDeal(hotDealId: number, input: SmartstoreHotDealInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const purchaseUrl = normalizeSmartstorePurchaseUrl(input.purchaseUrl);
  const result = await db.update(smartstoreHotDeals).set({ ...input, purchaseUrl, updatedAt: new Date() }).where(eq(smartstoreHotDeals.id, hotDealId));
  return { updated: getAffectedRows(result) > 0 };
}

export async function removeSmartstoreHotDeal(hotDealId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.delete(smartstoreHotDeals).where(eq(smartstoreHotDeals.id, hotDealId));
  return { removed: getAffectedRows(result) > 0 };
}

export async function markCandidateSentToTracking(userId: number, candidateId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(productCandidates).set({ status: "sent_to_tracking", updatedAt: new Date() }).where(and(eq(productCandidates.id, candidateId), eq(productCandidates.userId, userId)));
}

export type ProductSource = "goldbox" | "search" | "bestcategory" | "collection";
export type SyncJobType = "goldbox" | "bestcategory" | "price" | "retention" | "drive" | "search" | "deeplink" | "collection" | "lighthouse";
const SEARCH_QUOTA_SCOPE = "coupang-products-search";
const COUPANG_GLOBAL_RATE_LIMIT_SCOPE = "coupang-all-api-minute";
const COUPANG_TRACKING_RATE_LIMIT_SCOPE = "coupang-price-tracking-minute";
export const SEARCH_REFRESH_DEFERRED_REASON = "Search API 시간당 예산 보호를 위해 정기 재검색을 보류합니다. 사용자 검색 또는 수동 링크의 다음 안전 조회 기회에 다시 확인합니다.";

export function normalizeSearchKeyword(keyword: string) {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 160);
}

/** 실패 검색 기록 전용 정규화입니다. 구분 기호·대소문자·중복 토큰·검색어 순서 차이를 통합합니다. */
export function normalizeMissingSearchKeyword(keyword: string) {
  const synonymReplaced = keyword
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[×✕＊*]/g, " x ")
    .replace(/[,:;+/|()\[\]{}·]/g, " ")
    .replace(/폼클렌징/g, "클렌징폼")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = synonymReplaced.split(" ").filter(Boolean);
  return Array.from(new Set(tokens)).sort((left, right) => left.localeCompare(right, "ko")).join(" ").slice(0, 160);
}

/** 정확 SKU가 공식 응답에서 재확인될 때만 실패 링크를 새 링크 생성 대기로 되돌린다. */
export function getDeepLinkStatusAfterExactSkuRefresh(previousStatus: string | null | undefined) {
  return previousStatus === "ready" ? "ready" as const : "pending" as const;
}

export async function upsertCoupangProduct(product: CoupangProduct, source: ProductSource) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");

  const now = new Date();
  const externalProductId = getCoupangVariantKey(product);
  const existing = (await db.select().from(products).where(eq(products.externalProductId, externalProductId)).limit(1))[0];
  const refreshedDeepLinkStatus = getDeepLinkStatusAfterExactSkuRefresh(existing?.deepLinkStatus);
  const currentPrice = chooseTrackedPrice(product.productPrice, existing);
  const variant = describeProductVariant(product.productName, currentPrice, product.categoryName);
  const values = {
    externalProductId,
    name: product.productName,
    imageUrl: product.productImage,
    affiliateUrl: product.productUrl,
    categoryName: product.categoryName ?? null,
    familyKey: getProductFamilyKey(product.productName),
    variantLabel: variant.variantLabel,
    unitPrice: variant.unitPrice,
    unitLabel: variant.unitLabel,
    trackingPriority: source === "search" ? "low" as const : "normal" as const,
    currentPrice,
    lowestPrice: currentPrice,
    source,
    isRocket: Boolean(product.isRocket),
    isFreeShipping: Boolean(product.isFreeShipping),
    isActive: true,
    refreshState: "fresh" as const,
    lastRefreshReason: null,
    lastRefreshAttemptAt: now,
    nextRefreshAt: null,
    firstSeenAt: now,
    lastSeenAt: now,
  };

  await db.insert(products).values(values).onDuplicateKeyUpdate({
    set: {
      name: values.name,
      imageUrl: values.imageUrl,
      affiliateUrl: values.affiliateUrl,
      categoryName: values.categoryName,
      familyKey: values.familyKey,
      variantLabel: values.variantLabel,
      unitPrice: values.unitPrice,
      unitLabel: values.unitLabel,
      trackingPriority: sql`CASE WHEN ${products.trackingPriority} = 'high' THEN 'high' WHEN ${values.source} = 'search' THEN 'low' ELSE 'normal' END`,
      deepLinkStatus: refreshedDeepLinkStatus,
      deepLinkFailureReason: null,
      currentPrice: values.currentPrice,
      lowestPrice: sql`LEAST(${products.lowestPrice}, ${values.currentPrice})`,
      source: values.source,
      isRocket: values.isRocket,
      isFreeShipping: values.isFreeShipping,
      isActive: true,
      refreshState: values.refreshState,
      lastRefreshReason: hasWowMemberPrice(existing) ? "수집기 최신 와우 회원가 우선 유지" : values.lastRefreshReason,
      lastRefreshAttemptAt: now,
      nextRefreshAt: null,
      lastSeenAt: now,
    },
  });

  const saved = await db
    .select()
    .from(products)
    .where(eq(products.externalProductId, values.externalProductId))
    .limit(1);
  const stored = saved[0];
  if (!stored) throw new Error("Product could not be saved");

  if (!existing || existing.currentPrice !== values.currentPrice) {
    await db.insert(priceHistory).values({
      productId: stored.id,
      price: values.currentPrice,
      recordedAt: now,
    });
  }
  return stored;
}

export async function upsertCoupangProducts(items: CoupangProduct[], source: ProductSource) {
  const saved = [];
  for (const item of items) {
    if (isExcludedTrackingCategory({ categoryName: item.categoryName, productName: item.productName })) {
      console.info(`[Tracking] ${EXCLUDED_TRACKING_CATEGORY_LABEL} 제외 상품을 저장하지 않습니다: ${item.productName}`);
      continue;
    }
    saved.push(await upsertCoupangProduct(item, source));
  }
  return saved;
}

export async function replaceCategoryBestProducts(categoryId: number, productIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const uniqueProductIds = Array.from(new Set(productIds));
  const collectedAt = new Date();
  await db.transaction(async tx => {
    await tx.delete(categoryBestProducts).where(eq(categoryBestProducts.categoryId, categoryId));
    if (uniqueProductIds.length > 0) {
      await tx.insert(categoryBestProducts).values(uniqueProductIds.map((productId, position) => ({ categoryId, productId, position: position + 1, collectedAt })));
    }
  });
}

export async function listHomeFeaturedProducts(limit = 50) {
  const db = await getDb();
  const boundedLimit = Math.min(Math.max(limit, 1), 50);
  if (!db) return { products: [], source: "goldbox" as const };

  const ranked = await db
    .select({ productId: categoryBestProducts.productId, position: categoryBestProducts.position, collectedAt: categoryBestProducts.collectedAt })
    .from(categoryBestProducts)
    .innerJoin(products, eq(categoryBestProducts.productId, products.id))
    .where(eq(products.isActive, true))
    .orderBy(asc(categoryBestProducts.position), desc(categoryBestProducts.collectedAt))
    .limit(300);
  const orderedIds = Array.from(new Set(ranked.map(row => row.productId)));
  if (orderedIds.length > 0) {
    const stored = await db.select().from(products).where(and(inArray(products.id, orderedIds), eq(products.isActive, true)));
    const byId = new Map(stored.map(product => [product.id, product]));
    const ordered = orderedIds.flatMap(id => byId.get(id) ? [byId.get(id)!] : []);
    const categoryBest = selectRepresentativesPerFamily(selectCheapestPerFamilyUnit(ordered), 2).slice(0, boundedLimit);
    if (categoryBest.length > 0) return { products: categoryBest, source: "bestcategory" as const };
  }
  return { products: await listProducts({ source: "goldbox", limit: boundedLimit }), source: "goldbox" as const };
}

export async function listProducts(options: { source?: ProductSource; limit?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const rows = options.source
    ? await db.select().from(products).where(and(eq(products.source, options.source), eq(products.isActive, true))).orderBy(desc(products.lastSeenAt))
    : await db.select().from(products).where(eq(products.isActive, true)).orderBy(desc(products.lastSeenAt));
  const unitDeduped = selectCheapestPerFamilyUnit(rows);
  // source를 지정하지 않는 메인 최근 상품 목록만 상품군당 대표 2개로 제한합니다.
  const mainRepresentatives = options.source ? unitDeduped : selectRepresentativesPerFamily(unitDeduped, 2);
  return mainRepresentatives.slice(0, limit);
}

/** 홈 최상단 CTA용으로 이미 준비된 파트너스 딥링크 하나만 읽는다. 외부 API는 호출하지 않는다. */
export async function getStoredHomeCoupangLink() {
  const db = await getDb();
  if (!db) return null;
  const row = (await db.select({ url: products.deepLinkUrl })
    .from(products)
    .where(and(eq(products.isActive, true), eq(products.deepLinkStatus, "ready"), isNotNull(products.deepLinkUrl)))
    .orderBy(desc(products.lastSeenAt))
    .limit(1))[0];
  const url = row?.url?.trim();
  return url ? { url } : null;
}

export async function findCachedSearchProducts(keyword: string) {
  const db = await getDb();
  if (!db) return undefined;
  const normalizedKeyword = normalizeSearchKeyword(keyword);
  const cache = (
    await db.select().from(searchCaches).where(eq(searchCaches.normalizedKeyword, normalizedKeyword)).limit(1)
  )[0];
  if (!cache || cache.expiresAt <= new Date()) return undefined;
  const productIds = JSON.parse(cache.productIdsJson) as unknown;
  if (!Array.isArray(productIds) || !productIds.every(id => typeof id === "number")) return undefined;
  const records = productIds.length === 0 ? [] : await db.select().from(products).where(and(inArray(products.id, productIds), eq(products.isActive, true)));
  const byId = new Map(records.map(record => [record.id, record]));
  await db.update(searchCaches).set({ lastServedAt: new Date() }).where(eq(searchCaches.id, cache.id));
  return productIds.flatMap(id => byId.get(id) ? [byId.get(id)!] : []);
}

export async function invalidateCachedSearchProducts(keyword: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(searchCaches).where(eq(searchCaches.normalizedKeyword, normalizeSearchKeyword(keyword)));
}

export async function recordMissingSearch(keyword: string) {
  const db = await getDb();
  if (!db) return;
  const normalizedKeyword = normalizeMissingSearchKeyword(keyword);
  if (!normalizedKeyword) return;
  const now = new Date();
  try {
    await db.insert(missingSearches).values({ keyword: keyword.trim().slice(0, 160), normalizedKeyword, searchCount: 1, firstSearchedAt: now, lastSearchedAt: now }).onDuplicateKeyUpdate({
      set: { searchCount: sql`${missingSearches.searchCount} + 1`, lastSearchedAt: now, keyword: keyword.trim().slice(0, 160) },
    });
  } catch (error) {
    console.warn("[Search history] Failed to record missing search", error);
  }
}

export async function mergeDuplicateMissingSearchesForAdmin() {
  const db = await getDb();
  if (!db) return { groupsMerged: 0, rowsRemoved: 0, remaining: 0 };
  return db.transaction(async tx => {
    const rows = await tx.select().from(missingSearches);
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const canonical = normalizeMissingSearchKeyword(row.keyword);
      const group = groups.get(canonical) ?? [];
      group.push(row);
      groups.set(canonical, group);
    }
    let groupsMerged = 0;
    let rowsRemoved = 0;
    for (const [canonical, group] of Array.from(groups.entries())) {
      group.sort((left, right) => Number(right.searchCount) - Number(left.searchCount) || new Date(right.lastSearchedAt).getTime() - new Date(left.lastSearchedAt).getTime() || left.id - right.id);
      const winner = group[0];
      const totalSearchCount = group.reduce((sum, row) => sum + Number(row.searchCount), 0);
      const firstSearchedAt = group.reduce((earliest, row) => new Date(row.firstSearchedAt).getTime() < earliest.getTime() ? new Date(row.firstSearchedAt) : earliest, new Date(winner.firstSearchedAt));
      const lastSearchedAt = group.reduce((latest, row) => new Date(row.lastSearchedAt).getTime() > latest.getTime() ? new Date(row.lastSearchedAt) : latest, new Date(winner.lastSearchedAt));
      await tx.update(missingSearches).set({ normalizedKeyword: canonical, searchCount: totalSearchCount, firstSearchedAt, lastSearchedAt }).where(eq(missingSearches.id, winner.id));
      const duplicateIds = group.slice(1).map(row => row.id);
      if (duplicateIds.length > 0) {
        await tx.delete(missingSearches).where(inArray(missingSearches.id, duplicateIds));
        groupsMerged += 1;
        rowsRemoved += duplicateIds.length;
      }
    }
    return { groupsMerged, rowsRemoved, remaining: rows.length - rowsRemoved };
  });
}

export async function listMissingSearchesForAdmin(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(missingSearches).orderBy(desc(missingSearches.searchCount), desc(missingSearches.lastSearchedAt)).limit(Math.min(Math.max(limit, 1), 200));
  return rows.map(row => ({ ...row, ...classifyMissingSearch(row.keyword) }));
}

export async function deleteMissingSearchForAdmin(missingSearchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.delete(missingSearches).where(eq(missingSearches.id, missingSearchId));
  const deleted = getAffectedRows(result) > 0;
  return { deleted };
}

/** 이미 저장된 활성 상품으로 결과를 보여줄 수 있는 과거 실패 이력만 정리한다. 외부 쿠팡 API는 호출하지 않는다. */
export async function pruneResolvedMissingSearchesForAdmin(limit = 200) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const missing = await listMissingSearchesForAdmin(limit);
  if (missing.length === 0) return { checked: 0, removed: 0, remaining: 0 };
  const activeProducts = await db
    .select({ id: products.id, name: products.name, variantLabel: products.variantLabel, externalProductId: products.externalProductId, currentPrice: products.currentPrice })
    .from(products)
    .where(eq(products.isActive, true));
  const resolvedIds = missing
    .filter(item => rankSearchResults(item.keyword, activeProducts).length > 0)
    .map(item => item.id);
  if (resolvedIds.length > 0) await db.delete(missingSearches).where(inArray(missingSearches.id, resolvedIds));
  return { checked: missing.length, removed: resolvedIds.length, remaining: missing.length - resolvedIds.length };
}

/** 사용자 추가 요청은 검색어만 집계하며 이메일·IP 등 식별 정보는 저장하지 않습니다. */
export async function submitProductRequest(keyword: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const normalizedKeyword = normalizeSearchKeyword(keyword);
  if (!normalizedKeyword) throw new Error("요청할 상품명을 입력해 주세요.");
  const now = new Date();
  const requestKeyword = keyword.trim().slice(0, 160);
  await db.insert(productRequests).values({
    keyword: requestKeyword,
    normalizedKeyword,
    requestCount: 1,
    status: "pending",
    firstRequestedAt: now,
    lastRequestedAt: now,
  }).onDuplicateKeyUpdate({
    set: {
      keyword: requestKeyword,
      requestCount: sql`${productRequests.requestCount} + 1`,
      lastRequestedAt: now,
    },
  });
  const request = (await db.select().from(productRequests).where(eq(productRequests.normalizedKeyword, normalizedKeyword)).limit(1))[0];
  if (!request) throw new Error("상품 추가 요청을 저장하지 못했습니다.");
  return request;
}

export async function getProductRequestForAdmin(requestId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return (await db.select().from(productRequests).where(eq(productRequests.id, requestId)).limit(1))[0];
}

export async function listProductRequestsForAdmin(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(productRequests).orderBy(desc(productRequests.lastRequestedAt), desc(productRequests.requestCount)).limit(Math.min(Math.max(limit, 1), 200));
}

export async function updateProductRequestStatusForAdmin(requestId: number, status: "pending" | "reviewing" | "added" | "dismissed") {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.update(productRequests).set({ status, reviewedAt: new Date() }).where(eq(productRequests.id, requestId));
  const affectedRows = getAffectedRows(result);
  if (affectedRows === 0) throw new Error("상품 추가 요청을 찾을 수 없습니다.");
  return { requestId, status };
}

export type SearchEventInput = {
  userId: number | null;
  keyword: string;
  resultSource: string;
  resultCount: number;
};

/** 검색 품질 개선용 이벤트입니다. 사용자 이메일·IP는 저장하지 않습니다. */
export async function recordSearchEvent(input: SearchEventInput) {
  const db = await getDb();
  if (!db) return;
  const keyword = input.keyword.trim().slice(0, 160);
  if (!keyword) return;
  try {
    await db.insert(searchEvents).values({
      userId: input.userId,
      keyword,
      resultSource: input.resultSource.slice(0, 32),
      resultCount: Math.max(0, Math.min(Math.trunc(input.resultCount), 10)),
      searchedAt: new Date(),
    });
  } catch (error) {
    console.warn("[Search events] Failed to record search event", error);
  }
}

export async function listSearchEventsForAdmin(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: searchEvents.id,
      userId: searchEvents.userId,
      keyword: searchEvents.keyword,
      resultSource: searchEvents.resultSource,
      resultCount: searchEvents.resultCount,
      searchedAt: searchEvents.searchedAt,
    })
    .from(searchEvents)
    .orderBy(desc(searchEvents.searchedAt), desc(searchEvents.id))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export async function cacheSearchProducts(keyword: string, productIds: number[], ttlMs = 12 * 60 * 60 * 1000) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const now = new Date();
  const normalizedKeyword = normalizeSearchKeyword(keyword);
  await db.insert(searchCaches).values({
    normalizedKeyword,
    productIdsJson: JSON.stringify(productIds),
    fetchedAt: now,
    expiresAt: new Date(now.getTime() + ttlMs),
    lastServedAt: now,
  }).onDuplicateKeyUpdate({
    set: { productIdsJson: JSON.stringify(productIds), fetchedAt: now, expiresAt: new Date(now.getTime() + ttlMs), lastServedAt: now },
  });
}

export async function searchTrackedProducts(keyword: string, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  const terms = getSearchTokens(keyword);
  if (terms.length === 0) return [];
  // DB 후보는 핵심 토큰 하나라도 맞으면 넓게 가져오고, 최종 관련도 필터에서 브랜드·상품 유형을 다시 검증한다.
  // 기존의 모든 토큰 AND 조건은 '150ml 2개' 같은 옵션 설명 때문에 저장된 정상 상품도 찾지 못하게 했다.
  const conditions = terms.flatMap(term => getSearchTokenVariants(term).map(variant => or(
    like(products.name, `%${variant}%`),
    like(products.variantLabel, `%${variant}%`),
    like(products.unitLabel, `%${variant}%`),
    ...(Number.isFinite(Number(variant))
      ? [eq(products.quantity, Number(variant)), like(products.packSize, `%${variant}%`)]
      : []),
  )));
  return db.select().from(products).where(and(eq(products.isActive, true), or(...conditions))).orderBy(desc(products.lastSeenAt)).limit(Math.min(Math.max(limit, 1) * 10, 100));
}

/** 외부 쿠팡 API를 호출하지 않고, 실제 저장 상품·성공 검색어만으로 자동완성 후보를 제공합니다. */
export async function listSearchSuggestions(query: string, limit = 6) {
  const db = await getDb();
  const trimmed = query.trim().replace(/\s+/g, " ");
  if (!db || trimmed.length < 2) return [];
  const escaped = trimmed.replace(/[\\%_]/g, "\\$&");
  const pattern = `%${escaped}%`;
  const [productRows, historyRows] = await Promise.all([
    db.select({ name: products.name, variantLabel: products.variantLabel })
      .from(products)
      .where(and(eq(products.isActive, true), or(like(products.name, pattern), like(products.variantLabel, pattern))))
      .orderBy(desc(products.lastSeenAt))
      .limit(24),
    db.select({ keyword: searchEvents.keyword })
      .from(searchEvents)
      .where(and(ne(searchEvents.resultCount, 0), like(searchEvents.keyword, pattern)))
      .orderBy(desc(searchEvents.searchedAt))
      .limit(24),
  ]);
  return buildSearchSuggestions(trimmed, productRows, historyRows, limit);
}

/** 활성 상품 중 productId 단독 레거시 행과 정확 옵션 SKU가 동일한 구성·가격으로 겹친 후보입니다. */
export async function listDuplicateProductCandidatesForAdmin(limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const activeProducts = await db.select().from(products).where(eq(products.isActive, true));
  return listSafeMergeCandidates(activeProducts)
    .slice(0, Math.min(Math.max(limit, 1), 100))
    .map(candidate => ({
      source: candidate.source,
      target: candidate.target,
      reason: "동일 상품 페이지·구성·가격의 productId 단독 레거시 행과 정확 옵션 SKU",
    }));
}

async function getSafeMergeProducts(sourceProductId: number, targetProductId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db.select().from(products).where(inArray(products.id, [sourceProductId, targetProductId]));
  const source = rows.find(row => row.id === sourceProductId);
  const target = rows.find(row => row.id === targetProductId);
  if (!source || !target) throw new Error("병합할 상품을 찾을 수 없습니다.");
  const direction = getSafeMergeDirection(source, target);
  if (!direction || direction.source.id !== sourceProductId || direction.target.id !== targetProductId) {
    throw new Error("같은 상품 페이지의 동일 구성·가격인 레거시 상품과 정확 옵션 SKU만 병합할 수 있습니다.");
  }
  return { db, source, target };
}

/** 병합 전 관리자에게 이동·정리될 데이터 수를 보여 줍니다. */
export async function getDuplicateProductMergePreview(sourceProductId: number, targetProductId: number) {
  const { db, source, target } = await getSafeMergeProducts(sourceProductId, targetProductId);
  const [sourcePriceHistory, targetPriceHistory, sourceConfirmedPrices, sourceFavorites, targetFavorites, sourcePriceAlerts, sourceTargetAlerts, sourceCategoryProducts, sourceManualLinks] = await Promise.all([
    db.select().from(priceHistory).where(eq(priceHistory.productId, source.id)),
    db.select().from(priceHistory).where(eq(priceHistory.productId, target.id)),
    db.select().from(userConfirmedPrices).where(eq(userConfirmedPrices.productId, source.id)),
    db.select().from(favorites).where(eq(favorites.productId, source.id)),
    db.select().from(favorites).where(eq(favorites.productId, target.id)),
    db.select().from(priceAlertLogs).where(eq(priceAlertLogs.productId, source.id)),
    db.select().from(targetPriceAlertLogs).where(eq(targetPriceAlertLogs.productId, source.id)),
    db.select().from(categoryBestProducts).where(eq(categoryBestProducts.productId, source.id)),
    db.select().from(manualLinkTracks).where(eq(manualLinkTracks.productId, source.id)),
  ]);
  const targetHistoryKeys = new Set(targetPriceHistory.map(row => `${row.price}:${row.recordedAt.getTime()}`));
  return {
    source,
    target,
    counts: {
      priceHistoryToMove: sourcePriceHistory.filter(row => !targetHistoryKeys.has(`${row.price}:${row.recordedAt.getTime()}`)).length,
      duplicatePriceHistoryToRemove: sourcePriceHistory.filter(row => targetHistoryKeys.has(`${row.price}:${row.recordedAt.getTime()}`)).length,
      userConfirmedPricesToMove: sourceConfirmedPrices.length,
      favoritesToMove: sourceFavorites.filter(sourceFavorite => !targetFavorites.some(targetFavorite => targetFavorite.userId === sourceFavorite.userId)).length,
      favoriteSettingsToCombine: sourceFavorites.filter(sourceFavorite => targetFavorites.some(targetFavorite => targetFavorite.userId === sourceFavorite.userId)).length,
      priceAlertLogsToMove: sourcePriceAlerts.length,
      targetPriceAlertLogsToMove: sourceTargetAlerts.length,
      categoryBestEntriesToMove: sourceCategoryProducts.length,
      manualLinksToMove: sourceManualLinks.length,
    },
  };
}

/**
 * 가격 이력·확인 가격·찜·알림 로그·카테고리 노출·수동 링크를 정확 SKU 상품으로 이관합니다.
 * 원본 레거시 행은 삭제하지 않고 비활성화해 관리자 감사 이력을 보존합니다.
 */
export async function mergeDuplicateProductsForAdmin(sourceProductId: number, targetProductId: number) {
  const { db, source, target } = await getSafeMergeProducts(sourceProductId, targetProductId);
  return db.transaction(async tx => {
    const sourceHistory = await tx.select().from(priceHistory).where(eq(priceHistory.productId, source.id));
    const targetHistory = await tx.select().from(priceHistory).where(eq(priceHistory.productId, target.id));
    const targetHistoryKeys = new Set(targetHistory.map(row => `${row.price}:${row.recordedAt.getTime()}`));
    let movedPriceHistory = 0;
    let removedDuplicatePriceHistory = 0;
    for (const row of sourceHistory) {
      const key = `${row.price}:${row.recordedAt.getTime()}`;
      if (targetHistoryKeys.has(key)) {
        await tx.delete(priceHistory).where(eq(priceHistory.id, row.id));
        removedDuplicatePriceHistory += 1;
      } else {
        await tx.update(priceHistory).set({ productId: target.id }).where(eq(priceHistory.id, row.id));
        targetHistoryKeys.add(key);
        movedPriceHistory += 1;
      }
    }

    const { movedFavorites, combinedFavorites, movedCategoryEntries } = await transferFavoritesAndCategoryEntries(tx, source.id, target.id);

    const [confirmedResult, priceAlertResult, targetAlertResult, manualLinkResult] = await Promise.all([
      tx.update(userConfirmedPrices).set({ productId: target.id }).where(eq(userConfirmedPrices.productId, source.id)),
      tx.update(priceAlertLogs).set({ productId: target.id }).where(eq(priceAlertLogs.productId, source.id)),
      tx.update(targetPriceAlertLogs).set({ productId: target.id }).where(eq(targetPriceAlertLogs.productId, source.id)),
      tx.update(manualLinkTracks).set({ productId: target.id }).where(eq(manualLinkTracks.productId, source.id)),
    ]);
    const low = (await tx.select({ value: sql<number>`MIN(${priceHistory.price})` }).from(priceHistory).where(eq(priceHistory.productId, target.id)))[0]?.value;
    await tx.update(products).set({
      lowestPrice: Number(low ?? target.currentPrice),
      isActive: false,
      lastRefreshReason: `관리자 수동 병합 완료 · 정확 옵션 SKU 상품 #${target.id}로 이관`,
    }).where(eq(products.id, source.id));
    return {
      sourceProductId: source.id,
      targetProductId: target.id,
      movedPriceHistory,
      removedDuplicatePriceHistory,
      movedFavorites,
      combinedFavorites,
      movedCategoryEntries,
      movedUserConfirmedPrices: getAffectedRows(confirmedResult),
      movedPriceAlertLogs: getAffectedRows(priceAlertResult),
      movedTargetPriceAlertLogs: getAffectedRows(targetAlertResult),
      movedManualLinks: getAffectedRows(manualLinkResult),
    };
  });
}

export async function reserveSearchApiCall(now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.transaction(async tx => {
    const current = (await tx.select().from(searchApiQuotas).where(eq(searchApiQuotas.scope, SEARCH_QUOTA_SCOPE)).limit(1))[0];
    const snapshot: SearchQuotaSnapshot | null = current ? {
      windowStartedAt: current.windowStartedAt,
      callCount: current.callCount,
      lastCallAt: current.lastCallAt,
      blockedUntil: current.blockedUntil,
    } : null;
    const decision = decideSearchQuota(snapshot, now);
    if (!decision.allowed) return decision;
    const next = decision.next;
    if (!current) {
      await tx.insert(searchApiQuotas).values({ scope: SEARCH_QUOTA_SCOPE, ...next });
    } else {
      await tx.update(searchApiQuotas).set(next).where(eq(searchApiQuotas.scope, SEARCH_QUOTA_SCOPE));
    }
    return decision;
  });
}

export async function blockSearchApiUntil(until: Date, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const now = new Date();
  await db.insert(searchApiQuotas).values({
    scope: SEARCH_QUOTA_SCOPE,
    windowStartedAt: now,
    callCount: 0,
    blockedUntil: until,
    lastError: reason,
  }).onDuplicateKeyUpdate({ set: { blockedUntil: until, lastError: reason } });
}

export async function getSearchApiQuotaStatus(now = new Date()) {
  const db = await getDb();
  if (!db) return decideSearchQuota(null, now);
  const current = (await db.select().from(searchApiQuotas).where(eq(searchApiQuotas.scope, SEARCH_QUOTA_SCOPE)).limit(1))[0];
  return decideSearchQuota(current ? {
    windowStartedAt: current.windowStartedAt,
    callCount: current.callCount,
    lastCallAt: current.lastCallAt,
    blockedUntil: current.blockedUntil,
  } : null, now);
}

export async function reserveCoupangApiCall(callTypeOrNow: CoupangApiCallType | Date = "price-tracking", providedNow = new Date()) {
  const callType = callTypeOrNow instanceof Date ? "price-tracking" : callTypeOrNow;
  const now = callTypeOrNow instanceof Date ? callTypeOrNow : providedNow;
  const categoryScope = callType === "product-search" ? SEARCH_QUOTA_SCOPE : COUPANG_TRACKING_RATE_LIMIT_SCOPE;
  const categoryMaxCalls = callType === "product-search" ? SEARCH_API_MAX_CALLS_PER_MINUTE : COUPANG_TRACKING_MAX_CALLS_PER_MINUTE;
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.transaction(async tx => {
    const categoryCurrent = (await tx.select().from(searchApiQuotas).where(eq(searchApiQuotas.scope, categoryScope)).limit(1))[0];
    const categorySnapshot: CoupangRateLimitSnapshot | null = categoryCurrent ? {
      windowStartedAt: categoryCurrent.windowStartedAt,
      callCount: categoryCurrent.callCount,
      lastCallAt: categoryCurrent.lastCallAt,
      blockedUntil: categoryCurrent.blockedUntil,
    } : null;
    const categoryDecision = decideCoupangRateLimit(categorySnapshot, now, categoryMaxCalls);
    if (!categoryDecision.allowed) return categoryDecision;

    const current = (await tx.select().from(searchApiQuotas).where(eq(searchApiQuotas.scope, COUPANG_GLOBAL_RATE_LIMIT_SCOPE)).limit(1))[0];
    const snapshot: CoupangRateLimitSnapshot | null = current ? {
      windowStartedAt: current.windowStartedAt,
      callCount: current.callCount,
      lastCallAt: current.lastCallAt,
      blockedUntil: current.blockedUntil,
    } : null;
    const decision = decideCoupangRateLimit(snapshot, now);
    if (!decision.allowed) {
      const lastError = `Coupang 전역 분당 보호 모드(${decision.reason ?? "minute-limit"}): ${decision.retryAt?.toISOString() ?? "해제 시각 미정"} 이후 재개`;
      const next = { ...decision.next, lastError };
      if (!current) {
        await tx.insert(searchApiQuotas).values({ scope: COUPANG_GLOBAL_RATE_LIMIT_SCOPE, ...next });
      } else {
        await tx.update(searchApiQuotas).set(next).where(eq(searchApiQuotas.scope, COUPANG_GLOBAL_RATE_LIMIT_SCOPE));
      }
      return { ...decision, next };
    }
    if (!categoryCurrent) {
      await tx.insert(searchApiQuotas).values({ scope: categoryScope, ...categoryDecision.next });
    } else {
      await tx.update(searchApiQuotas).set(categoryDecision.next).where(eq(searchApiQuotas.scope, categoryScope));
    }
    if (!current) {
      await tx.insert(searchApiQuotas).values({ scope: COUPANG_GLOBAL_RATE_LIMIT_SCOPE, ...decision.next });
    } else {
      await tx.update(searchApiQuotas).set(decision.next).where(eq(searchApiQuotas.scope, COUPANG_GLOBAL_RATE_LIMIT_SCOPE));
    }
    return { ...decision, categoryCallType: callType };
  });
}

export async function blockCoupangApiUntil(until: Date, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const now = new Date();
  await db.insert(searchApiQuotas).values({
    scope: COUPANG_GLOBAL_RATE_LIMIT_SCOPE,
    windowStartedAt: now,
    callCount: 0,
    blockedUntil: until,
    lastError: reason,
  }).onDuplicateKeyUpdate({ set: { blockedUntil: until, lastError: reason } });
}

export async function recordCoupangRateLimitEvent(jobType: "search" | "deeplink", reason: string, retryAt?: Date) {
  try {
    const runId = await startSyncRun(jobType);
    await finishSyncRun(runId, "success", 0, `Coupang 전역 API 보호 모드(${reason}): ${retryAt?.toISOString() ?? "해제 시각 미정"} 이후 재개`);
  } catch (error) {
    console.warn("[Coupang rate limit] Failed to persist protection event", error);
  }
}

export async function getCoupangApiRateLimitStatus(now = new Date()) {
  const db = await getDb();
  if (!db) return decideCoupangRateLimit(null, now);
  const current = (await db.select().from(searchApiQuotas).where(eq(searchApiQuotas.scope, COUPANG_GLOBAL_RATE_LIMIT_SCOPE)).limit(1))[0];
  return decideCoupangRateLimit(current ? {
    windowStartedAt: current.windowStartedAt,
    callCount: current.callCount,
    lastCallAt: current.lastCallAt,
    blockedUntil: current.blockedUntil,
  } : null, now);
}

export async function listAllTrackedProducts() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(asc(products.lastSeenAt));
}

/** 관리자의 현재 가격 추이 목록입니다. 활성 상품 전체를 반환하며 페이지 표시는 UI에서 10개씩 나눕니다. */
export async function listCurrentPriceProductsForAdmin() {
  return listAllTrackedProducts();
}

export async function deleteTrackedProductForAdmin(productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.transaction(async tx => {
    const product = (await tx.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.isActive, true))).limit(1))[0];
    if (!product) return { deleted: false };
    await tx.delete(manualLinkTracks).where(eq(manualLinkTracks.productId, productId));
    await tx.delete(products).where(eq(products.id, productId));
    return { deleted: true };
  });
}

export async function deleteTrackedProductsForAdmin(productIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const uniqueIds = Array.from(new Set(productIds.filter(id => Number.isInteger(id) && id > 0)));
  if (uniqueIds.length === 0) return { deletedCount: 0, skippedCount: 0 };
  return db.transaction(async tx => {
    const activeProducts = await tx.select({ id: products.id }).from(products).where(and(inArray(products.id, uniqueIds), eq(products.isActive, true)));
    const activeIds = activeProducts.map(product => product.id);
    if (activeIds.length === 0) return { deletedCount: 0, skippedCount: uniqueIds.length };
    await tx.delete(manualLinkTracks).where(inArray(manualLinkTracks.productId, activeIds));
    await tx.delete(products).where(inArray(products.id, activeIds));
    return { deletedCount: activeIds.length, skippedCount: uniqueIds.length - activeIds.length };
  });
}

export async function markTrackedProductSoldOutForAdmin(productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.update(products).set({ inStock: false, lastRefreshReason: "관리자 품절 처리" }).where(and(eq(products.id, productId), eq(products.isActive, true), eq(products.inStock, true)));
  const affectedRows = getAffectedRows(result);
  return { soldOut: affectedRows === 1 };
}

export const SEARCH_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** 정확 SKU 미일치도 가격 추적 완료로 기록하고, 과도한 재호출 없이 24시간 뒤 재시도합니다. */
export const SEARCH_RECHECK_MISS_DELAY_MS = SEARCH_REFRESH_INTERVAL_MS;

export async function deferSearchProductRefresh(productIds: number[], now = new Date()) {
  if (productIds.length === 0) return 0;
  const db = await getDb();
  if (!db) return 0;
  const refreshBefore = new Date(now.getTime() - SEARCH_REFRESH_INTERVAL_MS);
  await db
    .update(products)
    .set({
      refreshState: "deferred",
      lastRefreshReason: sql`CASE WHEN ${products.refreshState} = 'deferred' THEN ${products.lastRefreshReason} ELSE ${SEARCH_REFRESH_DEFERRED_REASON} END`,
      nextRefreshAt: sql`COALESCE(${products.nextRefreshAt}, ${now})`,
    })
    .where(and(eq(products.source, "search"), inArray(products.id, productIds), lte(products.lastSeenAt, refreshBefore)));
  return productIds.length;
}

/** 관리자가 수동으로 전체 검색 등록 상품을 다음 외부 cron 처리 대기열에 넣습니다. */
export async function enqueueAllSearchProductsForPriceRefresh(now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db
    .update(products)
    .set({
      refreshState: "deferred",
      lastRefreshReason: "관리자 전체 가격 재확인 대기열 등록",
      nextRefreshAt: now,
    })
    .where(and(
      eq(products.source, "search"),
      eq(products.isActive, true),
      eq(products.inStock, true),
    ));
  return getAffectedRows(result);
}

/** 관리자가 현재 찜된 활성·재고 보유 상품만 가격 재확인 대기열에 넣습니다. */
export async function enqueueFavoritedProductsForPriceRefresh(now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const favoriteRows = await db
    .select({ productId: favorites.productId })
    .from(favorites);
  const productIds = Array.from(new Set(favoriteRows.map(row => row.productId)));
  if (productIds.length === 0) return { favoriteCount: 0, queuedCount: 0, skippedCount: 0 };

  const result = await db
    .update(products)
    .set({
      refreshState: "awaiting_collection",
      lastRefreshReason: "관리자 찜한 상품 수집기 가격 업데이트 대상 등록",
      nextRefreshAt: null,
    })
    .where(and(
      inArray(products.id, productIds),
      eq(products.isActive, true),
      eq(products.inStock, true),
    ));
  const queuedCount = getAffectedRows(result);
  return {
    favoriteCount: productIds.length,
    queuedCount,
    skippedCount: Math.max(productIds.length - queuedCount, 0),
  };
}

export async function getDeferredSearchProducts(limit = 24) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(products)
    .where(and(
      eq(products.source, "search"),
      eq(products.refreshState, "deferred"),
      eq(products.isActive, true),
      eq(products.inStock, true),
      or(isNull(products.nextRefreshAt), lte(products.nextRefreshAt, new Date()))
    ))
    .orderBy(asc(products.nextRefreshAt), asc(products.lastSeenAt), asc(products.id))
    .limit(Math.min(Math.max(limit, 1), 24));
}

/** 관리자 화면에 외부 cron이 실제 처리할 수 있는 보류 검색 상품 수를 제공합니다. */
export async function getExternalCronRecheckSummary(now = new Date()) {
  const db = await getDb();
  if (!db) return summarizeExternalCronQueue([], now);
  const rows = await db.select({
    source: products.source,
    refreshState: products.refreshState,
    isActive: products.isActive,
    inStock: products.inStock,
    nextRefreshAt: products.nextRefreshAt,
  }).from(products).where(inArray(products.refreshState, ["deferred", "awaiting_collection"]));
  return summarizeExternalCronQueue(rows, now);
}

export async function recordDeferredSearchRecheckMiss(productId: number, reason: string, now = new Date()): Promise<DeferredSearchRecheckMissOutcome> {
  const db = await getDb();
  if (!db) return "awaiting_collection";
  const product = (await db.select({
    inStock: products.inStock,
    wowMemberPrice: products.wowMemberPrice,
    wowMemberPriceObservedAt: products.wowMemberPriceObservedAt,
    deepLinkStatus: products.deepLinkStatus,
    deepLinkUrl: products.deepLinkUrl,
  }).from(products).where(eq(products.id, productId)).limit(1))[0];
  if (product && hasTrustedExtensionSkuObservation(product, now)) {
    const hasStoredDeepLink = product.deepLinkStatus === "ready" && Boolean(product.deepLinkUrl);
    await db.update(products).set({
      refreshState: "fresh",
      lastRefreshReason: `${reason} 다만 가신 수집기가 같은 정확 옵션 SKU를 최근 관측해 구매 경로와 가격 추적을 유지합니다.`,
      lastRefreshAttemptAt: now,
      nextRefreshAt: null,
      deepLinkStatus: hasStoredDeepLink ? "ready" : "pending",
      ...(hasStoredDeepLink ? { deepLinkFailureReason: null } : { deepLinkUrl: null, deepLinkFailureReason: null, deepLinkUpdatedAt: now }),
    }).where(eq(products.id, productId));
    return "collector_trusted";
  }
  await db.update(products).set({
    refreshState: "awaiting_collection",
    lastRefreshReason: `${reason} 가신 수집기에서 실제 옵션을 다시 관측하면 가격 추적을 재개합니다.`,
    lastRefreshAttemptAt: now,
    nextRefreshAt: null,
    // 정확 SKU가 공식 응답에서 사라진 경우 기존 제휴 링크는 판매 종료·옵션 변경일 수 있다.
    // 잘못된 옵션으로 이동시키지 않도록 자동 구매 링크를 숨기고, 다음 정확 SKU 응답에서만 재생성한다.
    deepLinkStatus: "failed",
    deepLinkUrl: null,
    deepLinkFailureReason: `정확 SKU 미확인: ${reason}`,
    deepLinkUpdatedAt: now,
  }).where(eq(products.id, productId));
  return "awaiting_collection";
}

/**
 * Search API 호출 자체가 일시적으로 실패한 경우에는 SKU 미일치·딥링크 실패로 처리하지 않는다.
 * 다음 허용된 재시도 시각만 기록해 외부 cron 한 번의 오류가 전체 실행을 중단하지 않게 한다.
 */
export const SEARCH_RECHECK_ERROR_DELAY_MS = 15 * 60 * 1000;

export async function recordDeferredSearchRecheckError(productId: number, reason: string, now = new Date()) {
  const db = await getDb();
  if (!db) return;
  const safeReason = reason.replace(/\s+/g, " ").trim().slice(0, 360) || "알 수 없는 Search API 오류";
  await db.update(products).set({
    refreshState: "deferred",
    lastRefreshReason: `쿠팡 Search API 오류로 재시도 대기: ${safeReason}`,
    lastRefreshAttemptAt: now,
    nextRefreshAt: new Date(now.getTime() + SEARCH_RECHECK_ERROR_DELAY_MS),
  }).where(eq(products.id, productId));
}

export async function getTrackingPrioritySummary() {
  const db = await getDb();
  if (!db) return { high: 0, normal: 0, low: 0 };
  const rows = await db
    .select({ priority: products.trackingPriority, count: sql<number>`COUNT(*)` })
    .from(products)
    .where(eq(products.isActive, true))
    .groupBy(products.trackingPriority);
  const summary = { high: 0, normal: 0, low: 0 };
  for (const row of rows) summary[row.priority] = Number(row.count);
  return summary;
}

export async function listPendingDeepLinkProducts(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(products)
    .where(and(eq(products.deepLinkStatus, "pending"), eq(products.isActive, true)))
    .orderBy(asc(products.firstSeenAt))
    .limit(Math.min(Math.max(limit, 1), 20));
}

/** 수집기에서 새로 확인된 정확 SKU만 즉시 딥링크 생성 대상으로 가져온다. */
export async function listPendingDeepLinkProductsByIds(productIds: number[]) {
  const db = await getDb();
  if (!db) return [];
  const ids = Array.from(new Set(productIds.filter(Number.isSafeInteger)));
  if (ids.length === 0) return [];
  return db
    .select()
    .from(products)
    .where(and(eq(products.deepLinkStatus, "pending"), eq(products.isActive, true), eq(products.inStock, true), inArray(products.id, ids)))
    .orderBy(asc(products.firstSeenAt))
    .limit(Math.min(ids.length, 20));
}

export async function saveDeepLinkForProduct(productId: number, deepLinkUrl: string | null, failureReason: string | null = null) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(products).set(buildDeepLinkUpdate(deepLinkUrl, new Date(), failureReason)).where(eq(products.id, productId));
}

export async function backfillProductVariantMetadata() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const records = await db.select().from(products);
  let updated = 0;
  for (const record of records) {
    const variant = describeProductVariant(record.name, record.currentPrice, record.categoryName);
    const familyKey = getProductFamilyKey(record.name);
    const externalProductId = getCoupangVariantKey({
      productId: Number(record.externalProductId.split(":")[0]),
      productUrl: record.affiliateUrl,
    });
    await db
      .update(products)
      .set({ externalProductId, familyKey, variantLabel: variant.variantLabel, unitPrice: variant.unitPrice, unitLabel: variant.unitLabel })
      .where(eq(products.id, record.id));
    updated += 1;
  }
  return updated;
}

export async function getProductById(productId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(products).where(and(eq(products.id, productId), eq(products.isActive, true))).limit(1))[0];
}

export async function markProductViewed(productId: number) {
  const db = await getDb();
  if (!db) return;
  const product = await getProductById(productId);
  if (!product) return;
  await db.update(products).set(buildProductViewUpdate(product.trackingPriority)).where(eq(products.id, productId));
}

export async function getProductDetail(productId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const product = await getProductById(productId);
  if (!product) return undefined;

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const history = await db
    .select()
    .from(priceHistory)
    .where(and(eq(priceHistory.productId, productId), gte(priceHistory.recordedAt, ninetyDaysAgo)))
    .orderBy(priceHistory.recordedAt);
  return { product, history };
}

export async function listRelatedProductVariants(productId: number) {
  const db = await getDb();
  if (!db) return [];
  const current = await getProductById(productId);
  if (!current?.familyKey) return [];
  return db
    .select()
    .from(products)
    .where(and(eq(products.familyKey, current.familyKey), ne(products.id, productId), eq(products.isActive, true)))
    .orderBy(asc(products.unitPrice), asc(products.currentPrice));
}

export async function listFavoriteProducts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const favoriteRows = await db
    .select({ productId: favorites.productId })
    .from(favorites)
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt));
  if (favoriteRows.length === 0) return [];
  return db.select().from(products).where(and(inArray(products.id, favoriteRows.map(row => row.productId)), eq(products.isActive, true)));
}

export async function listFavoriteTargetPrices(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ productId: favorites.productId, targetPrice: favorites.targetPrice })
    .from(favorites)
    .where(eq(favorites.userId, userId));
}

/** 목표가를 저장하거나 비웁니다. 값이 바뀔 때마다 버전을 높여 새 목표가에 한 번 다시 알림을 보낼 수 있습니다. */
export async function setFavoriteTargetPrice(userId: number, productId: number, targetPrice: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db
    .update(favorites)
    .set({ targetPrice, targetPriceVersion: sql`${favorites.targetPriceVersion} + 1` })
    .where(and(eq(favorites.userId, userId), eq(favorites.productId, productId)));
  const affectedRows = getAffectedRows(result);
  if (affectedRows === 0) throw new Error("찜한 상품에서만 목표 가격을 설정할 수 있습니다.");
  return { productId, targetPrice };
}

async function findProductForManualLink(externalProductId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const directProduct = (await db.select().from(products).where(eq(products.externalProductId, externalProductId)).limit(1))[0];
  if (directProduct) return directProduct;

  const partialSku = externalProductId.match(/^(\d+):(\d+)$/);
  if (!partialSku) return undefined;
  const candidates = await db.select().from(products)
    .where(like(products.externalProductId, `${partialSku[1]}:${partialSku[2]}:%`))
    .limit(2);
  return candidates.length === 1 ? candidates[0] : undefined;
}

export async function createManualLinkTrack(
  userId: number,
  link: ParsedCoupangLink,
  metadata: { queryKeyword?: string | null; optionLabel?: string | null } = {}
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const matchedProduct = await findProductForManualLink(link.externalProductId);
  const status = matchedProduct ? "active" as const : "waiting" as const;
  const lastError = matchedProduct ? null : "승인된 API의 다음 안전 조회 기회를 기다리는 중입니다.";
  const queryKeyword = metadata.queryKeyword?.trim() || null;
  const optionLabel = metadata.optionLabel?.trim() || null;
  await db.insert(manualLinkTracks).values({
    userId,
    linkKey: link.linkKey,
    submittedUrl: link.submittedUrl,
    externalProductId: link.externalProductId,
    queryKeyword,
    optionLabel,
    productId: matchedProduct?.id ?? null,
    status,
    lastError,
  }).onDuplicateKeyUpdate({
    set: {
      submittedUrl: link.submittedUrl,
      externalProductId: link.externalProductId,
      queryKeyword,
      optionLabel,
      productId: matchedProduct?.id ?? null,
      status,
      lastError,
      nextRetryAt: null,
    },
  });
  const track = (await db.select().from(manualLinkTracks).where(and(eq(manualLinkTracks.userId, userId), eq(manualLinkTracks.linkKey, link.linkKey))).limit(1))[0];
  if (!track) throw new Error("Manual link track could not be saved");
  return { track, product: matchedProduct ?? null };
}

export async function listManualLinkTracks(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const tracks = await db.select().from(manualLinkTracks).where(eq(manualLinkTracks.userId, userId)).orderBy(desc(manualLinkTracks.createdAt));
  const productIds = tracks.flatMap(track => track.productId ? [track.productId] : []);
  const matched = productIds.length > 0 ? await db.select().from(products).where(inArray(products.id, productIds)) : [];
  const productById = new Map(matched.map(product => [product.id, product]));
  return tracks.map(track => ({ ...track, product: track.productId ? productById.get(track.productId) ?? null : null }));
}

export async function getNextWaitingManualLink(now = new Date()) {
  const db = await getDb();
  if (!db) return undefined;
  return (
    await db
      .select()
      .from(manualLinkTracks)
      .where(and(eq(manualLinkTracks.status, "waiting"), or(isNull(manualLinkTracks.nextRetryAt), lte(manualLinkTracks.nextRetryAt, now))))
      .orderBy(manualLinkTracks.createdAt)
      .limit(1)
  )[0];
}

export async function setManualLinkWaitingError(trackId: number, detail: string, nextRetryAt: Date) {
  const db = await getDb();
  if (!db) return;
  await db.update(manualLinkTracks).set(buildManualLookupFailureUpdate(detail, nextRetryAt)).where(eq(manualLinkTracks.id, trackId));
}

export async function activateManualTracksForKnownProducts() {
  const db = await getDb();
  if (!db) return 0;
  const waiting = await db.select().from(manualLinkTracks).where(eq(manualLinkTracks.status, "waiting"));
  let activated = 0;
  for (const track of waiting) {
    const product = await findProductForManualLink(track.externalProductId);
    if (!product) continue;
    await db.update(manualLinkTracks).set(buildManualTrackUpdate("active", product.id)).where(eq(manualLinkTracks.id, track.id));
    await db.update(products).set({ trackingPriority: "high" }).where(eq(products.id, product.id));
    activated += 1;
  }
  return activated;
}

export async function isFavorite(userId: number, productId: number) {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.productId, productId)))
    .limit(1);
  return result.length > 0;
}

export async function toggleFavorite(userId: number, productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const product = await getProductById(productId);
  if (!product) throw new Error("Product not found");
  if (await isFavorite(userId, productId)) {
    await db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.productId, productId)));
    await db.update(products).set({ trackingPriority: product.source === "goldbox" ? "normal" : "low" }).where(eq(products.id, productId));
    return false;
  }
  await db.insert(favorites).values({ userId, productId });
  await db.update(products).set({ trackingPriority: "high", lastViewedAt: new Date() }).where(eq(products.id, productId));
  return true;
}

export type PriceAlertRecipient = {
  userId: number;
  email: string;
  productId: number;
  favoriteId: number;
  favoriteCreatedAt: Date;
  targetPrice: number | null;
  targetPriceVersion: number;
};

export type TargetPriceAlertRecipient = PriceAlertRecipient & {
  targetPrice: number;
  targetPriceVersion: number;
};

export async function listPriceAlertRecipients(productId: number): Promise<PriceAlertRecipient[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      userId: favorites.userId,
      email: users.email,
      productId: favorites.productId,
      favoriteId: favorites.id,
      favoriteCreatedAt: favorites.createdAt,
      targetPrice: favorites.targetPrice,
      targetPriceVersion: favorites.targetPriceVersion,
    })
    .from(favorites)
    .innerJoin(users, eq(favorites.userId, users.id))
    .where(and(eq(favorites.productId, productId), isNotNull(users.email)));

  return rows.flatMap(row => row.email ? [{ ...row, email: row.email }] : []);
}

export async function listTargetPriceAlertRecipients(productId: number): Promise<TargetPriceAlertRecipient[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      userId: favorites.userId,
      email: users.email,
      productId: favorites.productId,
      favoriteId: favorites.id,
      favoriteCreatedAt: favorites.createdAt,
      targetPrice: favorites.targetPrice,
      targetPriceVersion: favorites.targetPriceVersion,
    })
    .from(favorites)
    .innerJoin(users, eq(favorites.userId, users.id))
    .where(and(eq(favorites.productId, productId), isNotNull(users.email), isNotNull(favorites.targetPrice)));
  return rows.flatMap(row => row.email && row.targetPrice !== null ? [{ ...row, email: row.email, targetPrice: row.targetPrice }] : []);
}

export async function get24hLowestPrice(productId: number, now = new Date()) {
  const db = await getDb();
  if (!db) return null;
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const row = (
    await db
      .select({ price: priceHistory.price })
      .from(priceHistory)
      .where(and(eq(priceHistory.productId, productId), gte(priceHistory.recordedAt, since)))
      .orderBy(asc(priceHistory.price), desc(priceHistory.recordedAt))
      .limit(1)
  )[0];
  return row?.price ?? null;
}

export type ExtensionAlertObservationStatus = {
  productId: number;
  price: number | null;
  observedAt: Date | null;
  isFresh: boolean;
};

/** 알림 전용: 확장 프로그램이 수집한 와우 적용가만 사용하며 공식 API 이력은 절대 포함하지 않습니다. */
export async function listExtensionAlertObservationStatuses(productIds: number[], now = new Date()): Promise<ExtensionAlertObservationStatus[]> {
  const uniqueProductIds = Array.from(new Set(productIds.filter(id => Number.isSafeInteger(id) && id > 0)));
  if (uniqueProductIds.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  const productRows = await db.select({ id: products.id, externalProductId: products.externalProductId }).from(products).where(inArray(products.id, uniqueProductIds));
  if (productRows.length === 0) return [];
  const observations = await db.select({ externalProductId: collectedPriceHistory.externalProductId, price: collectedPriceHistory.price, collectedAt: collectedPriceHistory.collectedAt })
    .from(collectedPriceHistory)
    .where(and(
      inArray(collectedPriceHistory.externalProductId, productRows.map(product => product.externalProductId)),
      eq(collectedPriceHistory.source, "gasyn-extension"),
      eq(collectedPriceHistory.inStock, true),
      isNotNull(collectedPriceHistory.price),
    ))
    .orderBy(desc(collectedPriceHistory.collectedAt), desc(collectedPriceHistory.id));
  const latestBySku = new Map<string, typeof observations[number]>();
  for (const observation of observations) if (!latestBySku.has(observation.externalProductId)) latestBySku.set(observation.externalProductId, observation);
  return productRows.map(product => {
    const observation = latestBySku.get(product.externalProductId);
    const price = observation?.price ?? null;
    const observedAt = observation?.collectedAt ?? null;
    return { productId: product.id, price, observedAt, isFresh: isFreshExtensionAlertObservation(observedAt, now) };
  });
}

export async function get24hLowestExtensionPrice(productId: number, now = new Date()) {
  const db = await getDb();
  if (!db) return null;
  const product = (await db.select({ externalProductId: products.externalProductId }).from(products).where(eq(products.id, productId)).limit(1))[0];
  if (!product) return null;
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const row = (await db.select({ price: collectedPriceHistory.price })
    .from(collectedPriceHistory)
    .where(and(
      eq(collectedPriceHistory.externalProductId, product.externalProductId),
      eq(collectedPriceHistory.source, "gasyn-extension"),
      eq(collectedPriceHistory.inStock, true),
      isNotNull(collectedPriceHistory.price),
      gte(collectedPriceHistory.collectedAt, since),
    ))
    .orderBy(asc(collectedPriceHistory.price), desc(collectedPriceHistory.collectedAt))
    .limit(1))[0];
  return row?.price ?? null;
}

export async function listFavoriteExtensionAlertObservationStatuses(userId: number, now = new Date()) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ productId: favorites.productId }).from(favorites).where(eq(favorites.userId, userId));
  return listExtensionAlertObservationStatuses(rows.map(row => row.productId), now);
}

export type PriceAlertClaim = {
  userId: number;
  productId: number;
  favoriteId: number;
  favoriteCreatedAt: Date;
  currentPrice: number;
  lowestPrice24h: number;
};

function isDuplicateKeyError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ER_DUP_ENTRY";
}

/**
 * Reserves a single send slot for one favorite period before SMTP is called.
 * A retained reservation deliberately favors no duplicate mail on retried jobs.
 */
export async function claimPriceAlertDelivery(claim: PriceAlertClaim) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  try {
    const result = await db.insert(priceAlertLogs).values({
      userId: claim.userId,
      productId: claim.productId,
      favoriteId: claim.favoriteId,
      favoriteCreatedAt: claim.favoriteCreatedAt,
      currentPrice: claim.currentPrice,
      lowestPrice24h: claim.lowestPrice24h,
      deliveryStatus: "reserved",
    });
    return Number((result as unknown as [{ insertId: number }])[0].insertId);
  } catch (error) {
    if (isDuplicateKeyError(error)) return null;
    throw error;
  }
}

export async function completePriceAlertDelivery(alertLogId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(priceAlertLogs).set({ deliveryStatus: "sent", sentAt: new Date(), failureReason: null }).where(eq(priceAlertLogs.id, alertLogId));
}

export async function failPriceAlertDelivery(alertLogId: number, failureReason: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(priceAlertLogs).set({ deliveryStatus: "failed", failureReason: failureReason.slice(0, 2_000) }).where(eq(priceAlertLogs.id, alertLogId));
}

export type TargetPriceAlertClaim = {
  userId: number;
  productId: number;
  favoriteId: number;
  targetPriceVersion: number;
  targetPrice: number;
  currentPrice: number;
};

/** 목표가 버전별 단 한 번의 SMTP 전송 슬롯을 먼저 예약합니다. */
export async function claimTargetPriceAlertDelivery(claim: TargetPriceAlertClaim) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  try {
    const result = await db.insert(targetPriceAlertLogs).values({ ...claim, deliveryStatus: "reserved" });
    return Number((result as unknown as [{ insertId: number }])[0].insertId);
  } catch (error) {
    if (isDuplicateKeyError(error)) return null;
    throw error;
  }
}

export async function completeTargetPriceAlertDelivery(alertLogId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(targetPriceAlertLogs).set({ deliveryStatus: "sent", sentAt: new Date(), failureReason: null }).where(eq(targetPriceAlertLogs.id, alertLogId));
}

export async function failTargetPriceAlertDelivery(alertLogId: number, failureReason: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(targetPriceAlertLogs).set({ deliveryStatus: "failed", failureReason: failureReason.slice(0, 2_000) }).where(eq(targetPriceAlertLogs.id, alertLogId));
}

export async function unsubscribeFavoriteForPriceAlerts(input: { userId: number; productId: number; favoriteId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db
    .delete(favorites)
    .where(and(eq(favorites.id, input.favoriteId), eq(favorites.userId, input.userId), eq(favorites.productId, input.productId)));
  const affectedRows = getAffectedRows(result);
  if (affectedRows > 0) {
    const product = await getProductById(input.productId);
    if (product) await db.update(products).set({ trackingPriority: product.source === "goldbox" ? "normal" : "low" }).where(eq(products.id, input.productId));
  }
  return affectedRows > 0;
}

export async function startSyncRun(jobType: SyncJobType) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.insert(syncRuns).values({ jobType, status: "running" });
  return Number((result as unknown as [{ insertId: number }])[0].insertId);
}

export async function finishSyncRun(
  id: number,
  status: "success" | "failed",
  processedCount: number,
  detail?: string
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(syncRuns)
    .set({ status, processedCount, detail: detail ?? null, finishedAt: new Date() })
    .where(eq(syncRuns.id, id));
}

export async function prunePriceHistory(before: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.delete(priceHistory).where(lt(priceHistory.recordedAt, before));
  return getAffectedRows(result);
}

export async function pruneCollectedPriceHistory(before: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.delete(collectedPriceHistory).where(lt(collectedPriceHistory.collectedAt, before));
  return getAffectedRows(result);
}

export type CollectedPriceSyncResult = {
  observedCount: number;
  matchedCount: number;
  updatedCount: number;
  unchangedCount: number;
  staleCount: number;
  unmatchedCount: number;
  invalidCount: number;
  updatedProducts: (typeof products.$inferSelect)[];
};

/** 수집기의 최신 관측값을 동일한 옵션 SKU에만 반영합니다. 늦게 도착한 과거 관측값은 현재가를 덮어쓰지 않습니다. */
export async function syncLatestCollectedPricesToTrackedProducts(now = new Date()): Promise<CollectedPriceSyncResult> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const observations = await db.select({ id: collectedPriceHistory.id, externalProductId: collectedPriceHistory.externalProductId, price: collectedPriceHistory.price, inStock: collectedPriceHistory.inStock, collectedAt: collectedPriceHistory.collectedAt, optionName: collectedPriceHistory.optionName, capacityText: collectedPriceHistory.capacityText, quantity: collectedPriceHistory.quantity, packSize: collectedPriceHistory.packSize })
    .from(collectedPriceHistory)
    .where(gte(collectedPriceHistory.collectedAt, cutoff))
    .orderBy(desc(collectedPriceHistory.collectedAt), desc(collectedPriceHistory.id));
  const latestBySku = new Map<string, typeof observations[number]>();
  for (const observation of observations) if (!latestBySku.has(observation.externalProductId)) latestBySku.set(observation.externalProductId, observation);
  const latest = Array.from(latestBySku.values());
  if (latest.length === 0) return { observedCount: 0, matchedCount: 0, updatedCount: 0, unchangedCount: 0, staleCount: 0, unmatchedCount: 0, invalidCount: 0, updatedProducts: [] };
  const productRows = await db.select().from(products).where(inArray(products.externalProductId, latest.map(row => row.externalProductId)));
  const productBySku = new Map(productRows.map(product => [product.externalProductId, product]));
  const result: CollectedPriceSyncResult = { observedCount: latest.length, matchedCount: 0, updatedCount: 0, unchangedCount: 0, staleCount: 0, unmatchedCount: 0, invalidCount: 0, updatedProducts: [] };
  for (const observation of latest) {
    const product = productBySku.get(observation.externalProductId);
    if (!product) { result.unmatchedCount += 1; continue; }
    result.matchedCount += 1;
    const collectorMetadata = buildCollectorProductMetadata(observation);
    const metadataUpdate = hasMissingCollectorMetadata(product, collectorMetadata)
      ? {
          ...(collectorMetadata.variantLabel && !product.variantLabel ? { variantLabel: collectorMetadata.variantLabel } : {}),
          ...(collectorMetadata.quantity && !product.quantity ? { quantity: collectorMetadata.quantity } : {}),
          ...(collectorMetadata.packSize && !product.packSize ? { packSize: collectorMetadata.packSize } : {}),
        }
      : null;
    if (metadataUpdate) await db.update(products).set(metadataUpdate).where(eq(products.id, product.id));
    if (observation.collectedAt.getTime() <= product.lastSeenAt.getTime()) { result.staleCount += 1; continue; }
    if (!observation.inStock) {
      await db.update(products).set({ inStock: false, lastSeenAt: observation.collectedAt, refreshState: "fresh", lastRefreshAttemptAt: null, nextRefreshAt: null, lastRefreshReason: "가신 수집기 품절 관측" }).where(eq(products.id, product.id));
      result.updatedCount += 1;
      continue;
    }
    const observationPrice = observation.price;
    if (typeof observationPrice !== "number" || !Number.isSafeInteger(observationPrice) || observationPrice <= 0) { result.invalidCount += 1; continue; }
    if (observationPrice === product.currentPrice) {
      await db.update(products).set({ inStock: true, lastSeenAt: observation.collectedAt, refreshState: "fresh", lastRefreshAttemptAt: null, nextRefreshAt: null, lastRefreshReason: product.inStock ? "가신 수집기 최신 관측 반영" : "가신 수집기 재입고 관측" }).where(eq(products.id, product.id));
      result.unchangedCount += 1;
      continue;
    }
    const lowestPrice = Math.min(product.lowestPrice, observationPrice);
    await db.transaction(async tx => {
      await tx.update(products).set({ currentPrice: observationPrice, lowestPrice, inStock: true, lastSeenAt: observation.collectedAt, refreshState: "fresh", lastRefreshAttemptAt: null, nextRefreshAt: null, lastRefreshReason: product.inStock ? "가신 수집기 최신 관측 반영" : "가신 수집기 재입고 관측" }).where(eq(products.id, product.id));
      await tx.insert(priceHistory).values({ productId: product.id, price: observationPrice, recordedAt: observation.collectedAt });
    });
    result.updatedProducts.push({ ...product, currentPrice: observationPrice, lowestPrice, inStock: true, lastSeenAt: observation.collectedAt });
    result.updatedCount += 1;
  }
    return result;
}

export type CollectorMetadataSyncResult = {
  observedCount: number;
  matchedCount: number;
  updatedCount: number;
  unchangedCount: number;
  unmatchedCount: number;
  updatedProductIds: number[];
};

/** 최신 수집기 관측을 사용해 비어 있는 옵션 메타만 보완한다. 가격·재고·이력은 변경하지 않는다. */
export async function syncCollectorMetadataForAdmin(now = new Date()): Promise<CollectorMetadataSyncResult> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const observations = await db.select({
    externalProductId: collectedPriceHistory.externalProductId,
    collectedAt: collectedPriceHistory.collectedAt,
    optionName: collectedPriceHistory.optionName,
    capacityText: collectedPriceHistory.capacityText,
    quantity: collectedPriceHistory.quantity,
    packSize: collectedPriceHistory.packSize,
  }).from(collectedPriceHistory)
    .where(gte(collectedPriceHistory.collectedAt, cutoff))
    .orderBy(desc(collectedPriceHistory.collectedAt), desc(collectedPriceHistory.id));
  const latestBySku = new Map<string, typeof observations[number]>();
  for (const observation of observations) if (!latestBySku.has(observation.externalProductId)) latestBySku.set(observation.externalProductId, observation);
  const latest = Array.from(latestBySku.values());
  const result: CollectorMetadataSyncResult = { observedCount: latest.length, matchedCount: 0, updatedCount: 0, unchangedCount: 0, unmatchedCount: 0, updatedProductIds: [] };
  if (latest.length === 0) return result;
  const productRows = await db.select().from(products).where(inArray(products.externalProductId, latest.map(row => row.externalProductId)));
  const productBySku = new Map(productRows.map(product => [product.externalProductId, product]));
  for (const observation of latest) {
    const product = productBySku.get(observation.externalProductId);
    if (!product) { result.unmatchedCount += 1; continue; }
    result.matchedCount += 1;
    const metadata = buildCollectorProductMetadata(observation);
    const update = {
      ...(metadata.variantLabel && !product.variantLabel ? { variantLabel: metadata.variantLabel } : {}),
      ...(metadata.quantity && !product.quantity ? { quantity: metadata.quantity } : {}),
      ...(metadata.packSize && !product.packSize ? { packSize: metadata.packSize } : {}),
      ...(hasMissingCollectorMetadata(product, metadata) ? { optionMetadataSource: "collection" as const } : {}),
    };
    if (Object.keys(update).length === 0) { result.unchangedCount += 1; continue; }
    await db.update(products).set(update).where(eq(products.id, product.id));
    result.updatedCount += 1;
    result.updatedProductIds.push(product.id);
  }
  return result;
}

export async function getLatestSyncRun(jobType: SyncJobType) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(syncRuns).where(eq(syncRuns.jobType, jobType)).orderBy(desc(syncRuns.startedAt)).limit(1))[0];
}

export async function recordPriceTrackingMetric(input: {
  productId?: number | null;
  runId?: number | null;
  source: string;
  outcome: "matched" | "unmatched" | "collector_resolved" | "api_error" | "rate_limited";
  apiCalls: number;
  durationMs: number;
  occurredAt?: Date;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(priceTrackingMetrics).values({
    productId: input.productId ?? null,
    runId: input.runId ?? null,
    source: input.source,
    outcome: input.outcome,
    apiCalls: Math.max(0, Math.round(input.apiCalls)),
    durationMs: Math.max(0, Math.round(input.durationMs)),
    occurredAt: input.occurredAt ?? new Date(),
  });
}

export async function getPriceTrackingPerformanceMetrics(days = 7, now = new Date()) {
  const db = await getDb();
  const safeDays = Math.min(Math.max(Math.round(days), 1), 30);
  const windowStartedAt = new Date(now.getTime() - safeDays * 24 * 60 * 60 * 1000);
  if (!db) return buildPriceTrackingPerformanceMetrics([], windowStartedAt, now);
  const rows = await db.select({ productId: priceTrackingMetrics.productId, source: priceTrackingMetrics.source, outcome: priceTrackingMetrics.outcome, apiCalls: priceTrackingMetrics.apiCalls, durationMs: priceTrackingMetrics.durationMs, occurredAt: priceTrackingMetrics.occurredAt }).from(priceTrackingMetrics).where(and(gte(priceTrackingMetrics.occurredAt, windowStartedAt), lte(priceTrackingMetrics.occurredAt, now))).orderBy(asc(priceTrackingMetrics.occurredAt)).limit(20_000);
  return buildPriceTrackingPerformanceMetrics(rows, windowStartedAt, now);
}

export function buildPriceTrackingPerformanceMetrics(rows: Array<{ productId: number | null; source: string; outcome: "matched" | "unmatched" | "collector_resolved" | "api_error" | "rate_limited"; apiCalls: number; durationMs: number; occurredAt: Date }>, windowStartedAt: Date, now: Date) {
  const attempts = rows.length;
  const completed = rows.filter(row => row.outcome === "matched" || row.outcome === "unmatched" || row.outcome === "collector_resolved");
  const resolved = rows.filter(row => row.outcome === "matched" || row.outcome === "collector_resolved");
  const latestOutcomeByProduct = new Map<number, typeof rows[number]["outcome"]>();
  for (const row of rows) if (row.productId !== null) latestOutcomeByProduct.set(row.productId, row.outcome);
  const uniqueProducts = latestOutcomeByProduct.size;
  const unresolvedProducts = Array.from(latestOutcomeByProduct.values()).filter(outcome => outcome === "unmatched" || outcome === "api_error" || outcome === "rate_limited").length;
  const resolvedProducts = Array.from(latestOutcomeByProduct.values()).filter(outcome => outcome === "matched" || outcome === "collector_resolved").length;
  const productStates = new Map<number, { pendingAt?: number }>();
  const resolutionDurations: number[] = [];
  for (const row of rows) {
    if (row.productId === null) continue;
    const state = productStates.get(row.productId) ?? {};
    if (row.outcome === "unmatched" || row.outcome === "api_error" || row.outcome === "rate_limited") {
      state.pendingAt ??= row.occurredAt.getTime();
    } else if (row.outcome === "matched" || row.outcome === "collector_resolved") {
      if (state.pendingAt !== undefined) resolutionDurations.push(Math.max(0, row.occurredAt.getTime() - state.pendingAt));
      state.pendingAt = undefined;
    }
    productStates.set(row.productId, state);
  }
  const dayStarts = Array.from({ length: safeDayCount(windowStartedAt, now) }, (_, index) => {
    const date = new Date(windowStartedAt.getTime() + index * 24 * 60 * 60 * 1000);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  });
  const daily = dayStarts.map(start => {
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const dayRows = rows.filter(row => row.occurredAt >= start && row.occurredAt < end);
    const dayCompleted = dayRows.filter(row => row.outcome === "matched" || row.outcome === "unmatched" || row.outcome === "collector_resolved");
    return { date: start.toISOString().slice(0, 10), attempts: dayRows.length, matched: dayRows.filter(row => row.outcome === "matched").length, collectorResolved: dayRows.filter(row => row.outcome === "collector_resolved").length, unresolved: dayRows.filter(row => row.outcome === "unmatched").length, apiErrors: dayRows.filter(row => row.outcome === "api_error" || row.outcome === "rate_limited").length, avgApiCalls: dayRows.length ? roundMetric(dayRows.reduce((sum, row) => sum + Math.max(0, row.apiCalls), 0) / dayRows.length) : 0, successRate: dayCompleted.length ? roundMetric((dayRows.filter(row => row.outcome === "matched" || row.outcome === "collector_resolved").length / dayCompleted.length) * 100) : null };
  });
  const failureReasonCounts = { skuMismatch: rows.filter(row => row.outcome === "unmatched").length, collectorTrusted: rows.filter(row => row.outcome === "collector_resolved").length, apiError: rows.filter(row => row.outcome === "api_error").length, rateLimited: rows.filter(row => row.outcome === "rate_limited").length };
  return { windowStartedAt, windowEndedAt: now, summary: { attempts, uniqueProducts, completed: completed.length, matched: rows.filter(row => row.outcome === "matched").length, collectorResolved: rows.filter(row => row.outcome === "collector_resolved").length, unresolved: rows.filter(row => row.outcome === "unmatched").length, unresolvedProducts, resolvedProducts, apiErrors: rows.filter(row => row.outcome === "api_error").length, rateLimited: rows.filter(row => row.outcome === "rate_limited").length, failureReasonCounts, successRate: completed.length ? roundMetric((resolved.length / completed.length) * 100) : 0, collectorResolutionRate: completed.length ? roundMetric((rows.filter(row => row.outcome === "collector_resolved").length / completed.length) * 100) : 0, avgApiCallsPerProduct: attempts ? roundMetric(rows.reduce((sum, row) => sum + Math.max(0, row.apiCalls), 0) / attempts) : 0, avgResolutionHours: resolutionDurations.length ? roundMetric(resolutionDurations.reduce((sum, duration) => sum + duration, 0) / resolutionDurations.length / (60 * 60 * 1000)) : null }, daily };
}

function safeDayCount(start: Date, end: Date) {
  return Math.min(30, Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))));
}

function roundMetric(value: number) {
  return Math.round(value * 100) / 100;
}

export async function getPriceRefreshStats24h(now = new Date()) {
  const db = await getDb();
  if (!db) return buildPriceRefreshStats([], now);
  const windowStartedAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const runs = await db
    .select({ status: syncRuns.status, processedCount: syncRuns.processedCount, startedAt: syncRuns.startedAt, finishedAt: syncRuns.finishedAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.jobType, "price"), gte(syncRuns.startedAt, windowStartedAt)))
    .orderBy(asc(syncRuns.startedAt));
  return buildPriceRefreshStats(runs, now);
}

export async function listFailedPriceRefreshRuns24h(limit = 20, now = new Date()) {
  const db = await getDb();
  if (!db) return [];
  const windowStartedAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return db
    .select({ id: syncRuns.id, processedCount: syncRuns.processedCount, startedAt: syncRuns.startedAt, finishedAt: syncRuns.finishedAt, detail: syncRuns.detail })
    .from(syncRuns)
    .where(and(eq(syncRuns.jobType, "price"), eq(syncRuns.status, "failed"), gte(syncRuns.startedAt, windowStartedAt)))
    .orderBy(desc(syncRuns.startedAt))
    .limit(Math.max(1, Math.min(limit, 50)));
}

export async function markScheduleCompleted(jobKey: "goldbox" | "bestcategory" | "price" | "retention" | "lighthouse") {
  const db = await getDb();
  if (!db) return;
  await db.insert(scheduleSettings).values({ jobKey, lastCompletedAt: new Date() }).onDuplicateKeyUpdate({
    set: { lastCompletedAt: new Date() },
  });
}

export async function getScheduleByTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (
    await db
      .select()
      .from(scheduleSettings)
      .where(eq(scheduleSettings.scheduleCronTaskUid, taskUid))
      .limit(1)
  )[0];
}
