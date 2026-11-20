import { and, eq, gte, isNotNull } from "drizzle-orm";
import { products } from "../drizzle/schema";
import { isExcludedTrackingCategory } from "./categoryEligibility";
import { getDb } from "./db";
import { selectCheapestPerProductGroup } from "./productDedupe";
import { computeStoredUnitPrice, isUngroupedProductKey } from "./productVariant";

/**
 * /unit-price 공개 목록용 쿼리.
 *
 * "같은 상품군(familyKey)에서 용량·수량이 다른 구성끼리 단가가 얼마나 다른가"를 보여 준다.
 * 서로 다른 상품(쌀 vs 소고기)의 단가는 비교 의미가 없어서, 비교는 항상 같은 상품군·같은
 * 단가 기준(unitLabel) 안에서만 한다. 외부(쿠팡) API는 호출하지 않고 저장된 products만 읽는다.
 */

export type UnitPriceProductRow = Pick<
  typeof products.$inferSelect,
  | "id"
  | "name"
  | "familyKey"
  | "familyVariantKey"
  | "variantLabel"
  | "unitLabel"
  | "quantity"
  | "currentPrice"
  | "inStock"
  | "isActive"
  | "refreshState"
  | "categoryName"
  | "lastSeenAt"
>;

export type UnitPriceOption = {
  productId: number;
  name: string;
  variantLabel: string | null;
  quantity: number | null;
  currentPrice: number;
  /** unitLabel 기준량당 가격. 저장값이 아니라 현재가·용량으로 다시 계산한 값이다. */
  unitPrice: number;
  lastSeenAt: Date;
};

export type UnitPriceGroup = {
  familyKey: string;
  /** "100g", "10ml" 같은 단가 기준. 그룹 안의 모든 옵션이 같다. */
  unitLabel: string;
  /** 단가 오름차순. 첫 번째가 가장 낮은 단가. */
  options: UnitPriceOption[];
  /** 가장 비싼 옵션 단가 대비 가장 싼 옵션 단가가 몇 % 낮은지(소수 첫째 자리). */
  savingPct: number;
};

export type UnitPriceResult = {
  groups: UnitPriceGroup[];
  generatedAt: Date;
  /** 그룹이 너무 적으면 얇은 페이지가 색인되지 않도록 noindex 판단에 쓴다. */
  indexable: boolean;
};

export const UNIT_PRICE_CACHE_TTL_MS = 10 * 60 * 1000;
export const UNIT_PRICE_FRESH_WINDOW_MS = 48 * 60 * 60 * 1000;
export const UNIT_PRICE_MAX_GROUPS = 40;
export const UNIT_PRICE_MAX_OPTIONS_PER_GROUP = 6;
export const UNIT_PRICE_MIN_INDEXABLE_GROUPS = 10;
/** 단가 차이가 10% 미만이면 "비교할 만한 차이"로 보지 않는다. */
export const UNIT_PRICE_MIN_SAVING_PCT = 10;
/** 60% 초과는 용량 오인식(세트 용량 누락 등) 가능성이 커서 뺀다. deals 상한과 같은 기준. */
export const UNIT_PRICE_MAX_SAVING_PCT = 60;

const roundOne = (value: number) => Math.round(value * 10) / 10;

function toOption(row: UnitPriceProductRow): UnitPriceOption | null {
  const unitPrice = computeStoredUnitPrice({ price: row.currentPrice, variantLabel: row.variantLabel, quantity: row.quantity, unitLabel: row.unitLabel });
  if (!unitPrice || unitPrice <= 0) return null;
  return { productId: row.id, name: row.name, variantLabel: row.variantLabel, quantity: row.quantity, currentPrice: row.currentPrice, unitPrice, lastSeenAt: row.lastSeenAt };
}

/** DB 조회와 분리한 순수 조립 함수(단위 테스트 대상). */
export function buildUnitPriceGroups(rows: UnitPriceProductRow[]): UnitPriceGroup[] {
  const eligible = rows.filter(row => {
    if (!row.isActive || !row.inStock || row.currentPrice <= 0) return false;
    if (!row.familyKey?.trim() || !row.unitLabel || !row.familyVariantKey?.trim()) return false;
    if (isUngroupedProductKey(row.familyVariantKey)) return false;
    return !isExcludedTrackingCategory({ categoryName: row.categoryName, name: row.name });
  });

  // 같은 구성(용량·수량 동일)을 파는 여러 판매자 행은 최저가 한 행만 남긴다.
  const perVariant = selectCheapestPerProductGroup(eligible);

  const byGroup = new Map<string, { familyKey: string; unitLabel: string; options: UnitPriceOption[] }>();
  for (const row of perVariant) {
    const option = toOption(row);
    if (!option) continue;
    const familyKey = row.familyKey!.trim().toLowerCase();
    const unitLabel = row.unitLabel!;
    const key = `${familyKey}\u0000${unitLabel}`;
    const group = byGroup.get(key) ?? { familyKey, unitLabel, options: [] };
    group.options.push(option);
    byGroup.set(key, group);
  }

  const groups: UnitPriceGroup[] = [];
  for (const group of Array.from(byGroup.values())) {
    if (group.options.length < 2) continue;
    const options = group.options.sort((left, right) => left.unitPrice - right.unitPrice || left.currentPrice - right.currentPrice);
    const best = options[0]!.unitPrice;
    const worst = options[options.length - 1]!.unitPrice;
    const savingPct = roundOne(((worst - best) / worst) * 100);
    if (savingPct < UNIT_PRICE_MIN_SAVING_PCT || savingPct > UNIT_PRICE_MAX_SAVING_PCT) continue;
    groups.push({ familyKey: group.familyKey, unitLabel: group.unitLabel, options: options.slice(0, UNIT_PRICE_MAX_OPTIONS_PER_GROUP), savingPct });
  }

  return groups
    .sort((left, right) => right.savingPct - left.savingPct || left.familyKey.localeCompare(right.familyKey))
    .slice(0, UNIT_PRICE_MAX_GROUPS);
}

async function loadGroups(now: Date) {
  const db = await getDb();
  if (!db) return null;
  const fresh = new Date(now.getTime() - UNIT_PRICE_FRESH_WINDOW_MS);
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      familyKey: products.familyKey,
      familyVariantKey: products.familyVariantKey,
      variantLabel: products.variantLabel,
      unitLabel: products.unitLabel,
      quantity: products.quantity,
      currentPrice: products.currentPrice,
      inStock: products.inStock,
      isActive: products.isActive,
      refreshState: products.refreshState,
      categoryName: products.categoryName,
      lastSeenAt: products.lastSeenAt,
    })
    .from(products)
    .where(and(eq(products.isActive, true), eq(products.inStock, true), gte(products.lastSeenAt, fresh), isNotNull(products.unitLabel), isNotNull(products.familyKey), isNotNull(products.familyVariantKey)));
  return { generatedAt: now, groups: buildUnitPriceGroups(rows) };
}

type Snapshot = NonNullable<Awaited<ReturnType<typeof loadGroups>>>;
let cached: { expiresAt: number; value: Snapshot } | null = null;
let inflight: Promise<Snapshot | null> | null = null;

export function resetUnitPriceCacheForTest() {
  cached = null;
  inflight = null;
}

async function getSnapshot(): Promise<Snapshot | null> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (!inflight) {
    inflight = loadGroups(new Date())
      .then(value => {
        if (value) cached = { value, expiresAt: Date.now() + UNIT_PRICE_CACHE_TTL_MS };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export async function listUnitPriceGroups(): Promise<UnitPriceResult> {
  const snapshot = await getSnapshot();
  const groups = snapshot?.groups ?? [];
  return { groups, generatedAt: snapshot?.generatedAt ?? new Date(), indexable: groups.length >= UNIT_PRICE_MIN_INDEXABLE_GROUPS };
}

/** sitemap에는 그룹이 충분해 색인 가능한 때만 넣는다. 조회 실패 시 빈 배열. */
export async function getIndexableUnitPricePaths(): Promise<string[]> {
  try {
    const result = await listUnitPriceGroups();
    return result.indexable ? ["/unit-price"] : [];
  } catch (error) {
    console.error("[sitemap] unit-price path unavailable:", error);
    return [];
  }
}
