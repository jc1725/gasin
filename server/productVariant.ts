export type ProductVariantInfo = {
  variantLabel: string | null;
  unitPrice: number | null;
  unitLabel: string | null;
  quantity: number | null;
  /** 1개 기준 용량을 ml 또는 g으로 환산한 값. "1L"과 "1000ml"이 같은 값이 되도록 정규화한다. */
  sizeAmount: number | null;
  /** sizeAmount의 환산 기준 단위. 부피(ml)와 무게(g)를 절대 섞지 않기 위해 따로 보관한다. */
  measureUnit: MeasureUnit | null;
};

/** 용량 비교의 기준 단위. L은 ml로, kg은 g으로 환산해서 저장한다. */
export type MeasureUnit = "ml" | "g";

// 2026-09-17: "야마하 소프라노 리코더 저먼식 YRS-23G" 같은 모델명이 "23G"(23그램)로
// 오인식되어 "100g당 28,478원" 같은 엉뚱한 단가가 표시되던 버그를 계기로 두 가지 방어
// 장치를 추가함.
// 1) 순수 대문자 "G" 단독 표기(예: "23G")는 그램 단위로 인정하지 않는다. 실제 쿠팡
//    상품명에서 그램은 거의 항상 소문자 "g"로 쓰이고, 대문자 "G"는 모델명 접미사
//    (YRS-23G)나 "5G"(이동통신) 등 그램과 무관한 경우가 대부분이라 소문자만 인정해도
//    거의 모든 실제 용량 표기를 놓치지 않는다. (kg/mg/ml/L의 대문자 표기는 실제로도
//    자주 쓰이므로 계속 허용.)
// 2) 숫자 바로 앞에 하이픈이 붙어있으면(예: "YRS-23", "SM-A54") 모델명 코드의 일부일
//    가능성이 높으므로 아예 매칭하지 않는다(음의 lookbehind). 영문자 자체는 lookbehind에서
//    제외했는데, "2X330ml"처럼 배수 표기(영문자 바로 뒤에 용량)가 실제 쿠팡 상품명에
//    흔히 쓰이기 때문에 과도하게 막으면 정상 용량까지 놓칠 수 있음 — 하이픈만으로도
//    신고된 모델명 오탐(YRS-23G 등)은 충분히 막힘.
const SIZE_PATTERN = /(?<!-)(\d+(?:[.,]\d+)?)\s*(ml|mL|ML|L|l|kg|KG|Kg|g)(?![A-Za-z])/g;
// 2026-09-17: "오투 중학 과학 ... 2022개정 교육과정"처럼 "개정판"의 "개"가 수량으로
// 오인식되어("2022개") "1개당 8원" 같은 터무니없는 단가가 표시되던 버그를 계기로,
// 매칭된 단위 글자 바로 뒤에 한글 음절이 더 이어지면(예: "개" 다음에 "정") 그건 진짜
// 수량 표기가 아니라 다른 단어의 일부라고 보고 매칭에서 제외한다("12개월"의 "월" 등도
// 같은 이유로 함께 방지됨). client/src/lib/productMeta.ts의 getProductMetaTags가 이미
// 쓰고 있던 방식과 동일.
const QUANTITY_PATTERN = /(\d+)\s*(개입|개|팩|입|병|캔|봉|박스|세트|롤|매)(?![가-힣])/g;
// "30개입"처럼 한 묶음(포장 단위) 안의 낱개 수를 나타내는 표기. 이 표기가 있으면
// 뒤이어 오는 "2개"는 포장 개수(구매 수량)이지 옵션 규격이 아니므로, 용량 정보
// 없이 수량만으로 variantLabel/quantity를 추정하는 건 오히려 혼동을 준다.
const PACK_UNIT_PATTERN = /\d{1,6}\s*(?:개입|팩입|매입|장입|포입|정입|봉입)/;

export function getProductFamilyKey(name: string) {
  return name
    .toLowerCase()
    .replace(SIZE_PATTERN, " ")
    .replace(QUANTITY_PATTERN, " ")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[×xX]/g, " ")
    .replace(/[,/·|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500) || null;
}

function normalizeNumber(raw: string) {
  return Number(raw.replace(",", "."));
}

function normalizeSize(value: number, unit: string, unitBase: number) {
  const lower = unit.toLowerCase();
  if (lower === "l") return { amount: value * 1000, displayUnit: "L", unitLabel: `${unitBase}ml`, unitBase, measureUnit: "ml" as MeasureUnit };
  if (lower === "kg") return { amount: value * 1000, displayUnit: "kg", unitLabel: "100g", unitBase: 100, measureUnit: "g" as MeasureUnit };
  if (lower === "ml") return { amount: value, displayUnit: "ml", unitLabel: `${unitBase}ml`, unitBase, measureUnit: "ml" as MeasureUnit };
  return { amount: value, displayUnit: "g", unitLabel: "100g", unitBase: 100, measureUnit: "g" as MeasureUnit };
}

export function describeProductVariant(name: string, price: number, categoryName?: string | null): ProductVariantInfo {
  const quantities = Array.from(name.matchAll(QUANTITY_PATTERN));
  const quantityMatch = quantities.at(-1);
  const quantityCount = quantityMatch?.[1] ? Number(quantityMatch[1]) : null;
  const quantityUnit = quantityMatch?.[2] ?? "";

  const sizes = Array.from(name.matchAll(SIZE_PATTERN));
  const size = sizes.at(-1);
  const hasBareQuantitySignal = Boolean(quantityCount) && quantityCount! > 0 && !PACK_UNIT_PATTERN.test(name);

  // 용량(ml/g 등) 표기가 없어도 이름에 "2개"처럼 수량 표기가 있으면 그 값만이라도
  // 살려서 저장한다. 단가는 용량을 모르면 계산할 수 없으므로 null로 둔다.
  if (!size?.[1] || !size[2]) {
    if (!hasBareQuantitySignal) return { variantLabel: null, unitPrice: null, unitLabel: null, quantity: null, sizeAmount: null, measureUnit: null };
    return { variantLabel: `${quantityCount}${quantityUnit}`, unitPrice: null, unitLabel: null, quantity: quantityCount, sizeAmount: null, measureUnit: null };
  }

  const beautyProduct = /뷰티|스킨|클렌징|크림|세럼|앰플|향수|선크림|샴푸|바디워시/i.test(`${categoryName ?? ""} ${name}`);
  const normalized = normalizeSize(normalizeNumber(size[1]), size[2], beautyProduct ? 10 : 100);
  if (!Number.isFinite(normalized.amount) || normalized.amount <= 0) {
    if (!hasBareQuantitySignal) return { variantLabel: null, unitPrice: null, unitLabel: null, quantity: null, sizeAmount: null, measureUnit: null };
    return { variantLabel: `${quantityCount}${quantityUnit}`, unitPrice: null, unitLabel: null, quantity: quantityCount, sizeAmount: null, measureUnit: null };
  }

  const effectiveQuantity = quantityCount ?? 1;
  const sizeDisplay = `${size[1]}${normalized.displayUnit}`;
  const variantLabel = quantityMatch ? `${sizeDisplay} × ${effectiveQuantity}${quantityUnit}` : sizeDisplay;
  const totalAmount = normalized.amount * effectiveQuantity;

  return {
    variantLabel,
    unitPrice: Math.round((price * normalized.unitBase) / totalAmount),
    unitLabel: normalized.unitLabel,
    quantity: quantityCount,
    sizeAmount: roundMeasure(normalized.amount),
    measureUnit: normalized.measureUnit,
  };
}

/** drizzle/schema.ts의 products.familyVariantKey 길이와 반드시 같아야 한다. */
export const PRODUCT_GROUP_KEY_MAX_LENGTH = 500;

/** 소수점 용량(1.5L → 1500, 0.5ml)을 키로 쓸 수 있도록 부동소수점 오차를 잘라낸다. */
function roundMeasure(amount: number) {
  return Math.round(amount * 1000) / 1000;
}

/**
 * 2026-10-01: "본질은 같은 제품의 최저가를 확인하는 것" — 추적 단위를 판매자별 SKU가
 * 아니라 제품(상품명 + 용량 + 수량)으로 올린다. 같은 그룹 안에서는 가장 싼 SKU 하나만
 * 대표로 노출하고, 나머지는 가격 비교용으로 뒤에 남긴다.
 *
 * 기존에 묶음 기준으로 쓰던 unitLabel은 실제 용량이 아니라 "단가 환산 기준 단위"라서
 * 비뷰티 상품이면 30ml든 100ml든 전부 "100ml"이 된다(뷰티는 "10ml"). 그래서 용량이
 * 다른 상품이 한 그룹으로 합쳐지고, 대표도 용량이 아닌 묶음 개수당 가격으로 뽑혀서
 * 용량 작은 쪽이 "최저가"로 올라오는 문제가 있었다. 이 키는 1개 기준 용량을 ml·g으로
 * 환산한 값과 수량을 직접 쓰기 때문에 "1L"과 "1000ml"은 같은 그룹, "30ml"과 "100ml"은
 * 다른 그룹이 된다. 부피(ml)와 무게(g)는 같은 숫자여도 절대 섞이지 않는다.
 *
 * 용량을 읽지 못한 상품은 비교 기준이 없으므로 null을 돌려주고 묶지 않는다 — 서로 다른
 * 제품을 같은 것으로 합치는 쪽이 최저가를 못 찾는 쪽보다 훨씬 위험하다.
 */
export function buildProductGroupKey(familyKey: string | null, variant: Pick<ProductVariantInfo, "sizeAmount" | "measureUnit" | "quantity">) {
  const family = familyKey?.trim().toLowerCase();
  if (!family) return null;
  if (!variant.sizeAmount || !variant.measureUnit) return null;
  if (!(variant.sizeAmount > 0)) return null;
  const quantity = variant.quantity && variant.quantity > 0 ? variant.quantity : 1;
  const suffix = `|${variant.measureUnit}|${roundMeasure(variant.sizeAmount)}|${quantity}`;
  // 컬럼(varchar 500)에 인덱스를 걸기 때문에 상품명 쪽을 먼저 잘라서 용량·수량이 절대
  // 잘려나가지 않게 한다 — 꼬리가 잘리면 용량이 다른 제품이 같은 그룹으로 합쳐진다.
  return `${family.slice(0, PRODUCT_GROUP_KEY_MAX_LENGTH - suffix.length)}${suffix}`;
}

/** 상품명만으로 그룹키를 구한다. 가격은 단가 계산에만 쓰이므로 그룹키에는 영향이 없다. */
export function getProductGroupKey(name: string, categoryName?: string | null) {
  return buildProductGroupKey(getProductFamilyKey(name), describeProductVariant(name, 0, categoryName ?? null));
}

/**
 * 저장된 variantLabel("30ml", "30ml × 2개", "1L")에서 용량을 다시 읽는다.
 *
 * 관리자가 "옵션 수정"으로 고친 값과 수집기가 실제 옵션 드롭다운에서 읽은 값은 상품명보다
 * 정확해서 upsert가 덮어쓰지 않고 보존한다(optionMetadataSource). 그룹키도 같은 값을 써야
 * 하므로, 상품명이 아니라 최종 저장값에서 용량을 뽑는다.
 */
export function parseVariantLabelMeasure(variantLabel: string | null | undefined) {
  if (!variantLabel) return { sizeAmount: null, measureUnit: null } as Pick<ProductVariantInfo, "sizeAmount" | "measureUnit">;
  const match = Array.from(variantLabel.matchAll(SIZE_PATTERN)).at(0);
  if (!match?.[1] || !match[2]) return { sizeAmount: null, measureUnit: null } as Pick<ProductVariantInfo, "sizeAmount" | "measureUnit">;
  const normalized = normalizeSize(normalizeNumber(match[1]), match[2], 100);
  if (!Number.isFinite(normalized.amount) || normalized.amount <= 0) {
    return { sizeAmount: null, measureUnit: null } as Pick<ProductVariantInfo, "sizeAmount" | "measureUnit">;
  }
  return { sizeAmount: roundMeasure(normalized.amount), measureUnit: normalized.measureUnit };
}

/**
 * 실제로 DB에 저장된 값(familyKey · variantLabel · quantity)만으로 그룹키를 만든다.
 * 모든 저장 경로(공식 API upsert, 수집기, 관리자 수동 수정, 백필)가 이 한 함수를 쓰기
 * 때문에 경로마다 그룹키가 달라지는 일이 생기지 않는다.
 */
export type StoredGroupKeyInput = {
  familyKey?: string | null;
  variantLabel?: string | null;
  quantity?: number | null;
  externalProductId?: string | null;
};

/**
 * 용량을 읽지 못해 묶을 수 없는 상품에 붙이는 접두사. SKU 하나짜리 그룹이 되어 다른
 * 상품과 절대 합쳐지지 않는다. 컬럼을 null로 비워두지 않는 이유는 두 가지다 — 그룹
 * 조회 쪽에서 null 예외를 따로 다루지 않아도 되고, 백필이 "아직 안 채운 행"과 "채울 수
 * 없는 행"을 구분할 수 있어 같은 행을 영원히 다시 훑지 않는다.
 */
export const UNGROUPED_KEY_PREFIX = "sku:";

export function isUngroupedProductKey(key: string | null | undefined) {
  return Boolean(key?.startsWith(UNGROUPED_KEY_PREFIX));
}

export function resolveStoredProductGroupKey(record: StoredGroupKeyInput) {
  const measure = parseVariantLabelMeasure(record.variantLabel ?? null);
  const grouped = buildProductGroupKey(record.familyKey ?? null, { ...measure, quantity: record.quantity ?? null });
  if (grouped) return grouped;
  const sku = record.externalProductId?.trim();
  return sku ? `${UNGROUPED_KEY_PREFIX}${sku}`.slice(0, PRODUCT_GROUP_KEY_MAX_LENGTH) : null;
}

/**
 * 저장 직전 객체에 familyVariantKey를 붙인다. 모든 저장 경로가 이 래퍼를 통과하게 해서
 * "어떤 경로로 들어온 행은 그룹키가 비어 있다" 같은 구멍이 생기지 않게 한다.
 */
export function withProductGroupKey<T extends StoredGroupKeyInput>(record: T): T & { familyVariantKey: string | null } {
  return { ...record, familyVariantKey: resolveStoredProductGroupKey(record) };
}

/**
 * 일부 컬럼만 바꾸는 부분 갱신에 그룹키를 붙인다. 갱신 객체에 키가 들어 있으면 그 값을,
 * 없으면 기존 행의 값을 써서 "갱신 후 최종 상태" 기준으로 그룹키를 계산한다. 관리자가
 * 옵션을 비우는 경우(명시적 null)도 그대로 반영되도록 `in` 연산자로 판별한다.
 */
export function withMergedProductGroupKey<T extends StoredGroupKeyInput>(existing: StoredGroupKeyInput, update: T): T & { familyVariantKey: string | null } {
  const merged: StoredGroupKeyInput = {
    familyKey: "familyKey" in update ? update.familyKey ?? null : existing.familyKey ?? null,
    variantLabel: "variantLabel" in update ? update.variantLabel ?? null : existing.variantLabel ?? null,
    quantity: "quantity" in update ? update.quantity ?? null : existing.quantity ?? null,
    externalProductId: "externalProductId" in update ? update.externalProductId ?? null : existing.externalProductId ?? null,
  };
  return { ...update, familyVariantKey: resolveStoredProductGroupKey(merged) };
}
