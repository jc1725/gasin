import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { priceHistory, products } from "../drizzle/schema";
import { isExcludedTrackingCategory } from "./categoryEligibility";
import { getDb } from "./db";
import { selectCheapestPerProductGroupByRecency, selectRepresentativesPerFamily } from "./productDedupe";

/**
 * /deals/drops, /deals/low 공개 목록용 쿼리.
 *
 * 외부(쿠팡) API는 호출하지 않고, 이미 저장된 priceHistory(90일)와 products만 읽는다.
 * 집계 결과는 10분간 메모리에 캐시하고, 동시 요청은 하나의 계산을 공유한다.
 */

export type DealKind = "drops" | "low";
export type DealProduct = typeof products.$inferSelect;

export type DealItem = {
  product: DealProduct;
  /** drops: 최근 7일 안의 최고 관측가, low: 90일 최고 관측가. */
  referencePrice: number;
  /** referencePrice 대비 현재가 하락률(%), 소수 첫째 자리. */
  changePct: number;
  low90: number;
  high90: number;
};

export type DealsResult = {
  kind: DealKind;
  items: DealItem[];
  generatedAt: Date;
  /** 목록이 너무 짧으면 얇은 페이지가 색인되지 않도록 noindex 판단에 쓴다. */
  indexable: boolean;
};

export type PriceStats = {
  productId: number;
  currentPrice: number;
  min90: number;
  max90: number;
  max7: number;
  points: number;
};

export const DEALS_CACHE_TTL_MS = 10 * 60 * 1000;
export const DEALS_MAX_ITEMS = 60;
export const DEALS_MIN_INDEXABLE_ITEMS = 20;
export const DEALS_FRESH_WINDOW_MS = 48 * 60 * 60 * 1000;
export const DEALS_DROP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const DEALS_HISTORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
export const DEALS_MIN_POINTS = 3;
/** 하락 폭 조건: 5% 이상, 500원 이상. 70% 초과는 옵션 오인식·와우가 혼입 등 데이터 오류일 가능성이 커서 뺀다. */
export const DEALS_MIN_DROP_PCT = 5;
export const DEALS_MIN_DROP_WON = 500;
export const DEALS_MAX_DROP_PCT = 70;
/** 저점 근접 조건: 현재가가 90일 최저 관측가의 5% 이내이고, 90일 안에 최저 대비 10% 이상 변동한 이력이 있을 것. */
export const DEALS_LOW_NEAR_RATIO = 1.05;
export const DEALS_LOW_MIN_RANGE_RATIO = 1.1;
const DEALS_CANDIDATE_LIMIT = 300;

const roundOne = (value: number) => Math.round(value * 10) / 10;

export function evaluateDrop(stats: PriceStats) {
  if (stats.points < DEALS_MIN_POINTS) return null;
  const reference = stats.max7;
  if (!Number.isFinite(reference) || reference <= stats.currentPrice) return null;
  const diff = reference - stats.currentPrice;
  const pct = (diff / reference) * 100;
  if (diff < DEALS_MIN_DROP_WON || pct < DEALS_MIN_DROP_PCT || pct > DEALS_MAX_DROP_PCT) return null;
  return { referencePrice: reference, changePct: roundOne(pct) };
}

export function evaluateLowZone(stats: PriceStats) {
  if (stats.points < DEALS_MIN_POINTS || stats.min90 <= 0) return null;
  if (stats.currentPrice > stats.min90 * DEALS_LOW_NEAR_RATIO) return null;
  if (stats.max90 < stats.min90 * DEALS_LOW_MIN_RANGE_RATIO) return null;
  const pct = ((stats.max90 - stats.currentPrice) / stats.max90) * 100;
  if (pct > DEALS_MAX_DROP_PCT) return null;
  return { referencePrice: stats.max90, changePct: roundOne(Math.max(pct, 0)) };
}

type Candidate = { stats: PriceStats; referencePrice: number; changePct: number };

function topCandidates(statsList: PriceStats[], evaluate: (stats: PriceStats) => { referencePrice: number; changePct: number } | null) {
  const candidates: Candidate[] = [];
  for (const stats of statsList) {
    const result = evaluate(stats);
    if (result) candidates.push({ stats, ...result });
  }
  return candidates.sort((left, right) => right.changePct - left.changePct || left.stats.productId - right.stats.productId).slice(0, DEALS_CANDIDATE_LIMIT);
}

function assembleItems(candidates: Candidate[], rowsById: Map<number, DealProduct>): DealItem[] {
  const rows = candidates.flatMap(candidate => {
    const row = rowsById.get(candidate.stats.productId);
    if (!row || !row.isActive || !row.inStock) return [];
    if (isExcludedTrackingCategory({ categoryName: row.categoryName, name: row.name })) return [];
    return [row];
  });
  // 같은 제품 그룹(용량·수량 동일)은 최저가 한 행만, 같은 상품군은 대표 2개까지만 남긴다.
  const kept = new Set(selectRepresentativesPerFamily(selectCheapestPerProductGroupByRecency(rows), 2).map(row => row.id));
  const byId = new Map(candidates.map(candidate => [candidate.stats.productId, candidate]));
  return candidates
    .filter(candidate => kept.has(candidate.stats.productId))
    .flatMap(candidate => {
      const product = rowsById.get(candidate.stats.productId);
      if (!product) return [];
      const source = byId.get(candidate.stats.productId)!;
      return [{ product, referencePrice: source.referencePrice, changePct: source.changePct, low90: source.stats.min90, high90: source.stats.max90 }];
    })
    .slice(0, DEALS_MAX_ITEMS);
}

/** DB 조회와 분리한 순수 조립 함수(단위 테스트 대상). */
export function buildDealsFromData(statsList: PriceStats[], productRows: DealProduct[]) {
  const rowsById = new Map(productRows.map(row => [row.id, row]));
  return {
    drops: assembleItems(topCandidates(statsList, evaluateDrop), rowsById),
    low: assembleItems(topCandidates(statsList, evaluateLowZone), rowsById),
  };
}

async function loadSnapshot(now: Date) {
  const db = await getDb();
  if (!db) return null;
  const since90 = new Date(now.getTime() - DEALS_HISTORY_WINDOW_MS);
  const since7 = new Date(now.getTime() - DEALS_DROP_WINDOW_MS);
  const fresh = new Date(now.getTime() - DEALS_FRESH_WINDOW_MS);

  const rawStats = await db
    .select({
      productId: products.id,
      currentPrice: products.currentPrice,
      min90: sql<number>`MIN(${priceHistory.price})`,
      max90: sql<number>`MAX(${priceHistory.price})`,
      max7: sql<number>`MAX(CASE WHEN ${gte(priceHistory.recordedAt, since7)} THEN ${priceHistory.price} END)`,
      points: sql<number>`COUNT(${priceHistory.id})`,
    })
    .from(products)
    .innerJoin(priceHistory, and(eq(priceHistory.productId, products.id), gte(priceHistory.recordedAt, since90)))
    .where(and(eq(products.isActive, true), eq(products.inStock, true), gte(products.lastSeenAt, fresh)))
    .groupBy(products.id, products.currentPrice)
    .having(sql`COUNT(${priceHistory.id}) >= ${DEALS_MIN_POINTS}`);

  const statsList: PriceStats[] = rawStats.map(row => ({
    productId: row.productId,
    currentPrice: Number(row.currentPrice),
    min90: Number(row.min90),
    max90: Number(row.max90),
    max7: row.max7 == null ? Number.NaN : Number(row.max7),
    points: Number(row.points),
  }));

  const candidateIds = new Set<number>();
  for (const candidate of topCandidates(statsList, evaluateDrop)) candidateIds.add(candidate.stats.productId);
  for (const candidate of topCandidates(statsList, evaluateLowZone)) candidateIds.add(candidate.stats.productId);
  const productRows = candidateIds.size === 0 ? [] : await db.select().from(products).where(and(inArray(products.id, Array.from(candidateIds)), eq(products.isActive, true)));
  return { generatedAt: now, ...buildDealsFromData(statsList, productRows) };
}

type Snapshot = NonNullable<Awaited<ReturnType<typeof loadSnapshot>>>;
let cached: { expiresAt: number; value: Snapshot } | null = null;
let inflight: Promise<Snapshot | null> | null = null;

export function resetDealsCacheForTest() {
  cached = null;
  inflight = null;
}

async function getSnapshot(): Promise<Snapshot | null> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (!inflight) {
    inflight = loadSnapshot(new Date())
      .then(value => {
        if (value) cached = { value, expiresAt: Date.now() + DEALS_CACHE_TTL_MS };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export async function listDeals(kind: DealKind, limit = DEALS_MAX_ITEMS): Promise<DealsResult> {
  const snapshot = await getSnapshot();
  const all = snapshot ? snapshot[kind] : [];
  return {
    kind,
    items: all.slice(0, Math.min(Math.max(limit, 1), DEALS_MAX_ITEMS)),
    generatedAt: snapshot?.generatedAt ?? new Date(),
    indexable: all.length >= DEALS_MIN_INDEXABLE_ITEMS,
  };
}

/** sitemap에는 색인 가능한(목록이 충분한) 딜 페이지만 넣는다. 조회 실패 시 빈 배열. */
export async function getIndexableDealPaths(): Promise<string[]> {
  try {
    const [drops, low] = await Promise.all([listDeals("drops"), listDeals("low")]);
    return [...(drops.indexable ? ["/deals/drops"] : []), ...(low.indexable ? ["/deals/low"] : [])];
  } catch (error) {
    console.error("[sitemap] deal paths unavailable:", error);
    return [];
  }
}
