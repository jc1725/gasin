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

/**
 * 2026-10-01: "비플레인 녹두 약산성 클렌징폼 120ml + 80ml 기획세트"가 용량 80ml로
 * 기록되고 있었다. 용량 표기를 여러 개 찾은 뒤 마지막 하나(sizes.at(-1))만 쓰고 있어서,
 * 기획 구성의 뒤쪽 용량만 남고 앞쪽 120ml이 통째로 사라졌다. 그 결과 단가도 200ml이
 * 아니라 80ml 기준으로 계산되고(77,200원이 "10ml당 9,650원"), 그룹키도 80ml짜리 낱개
 * 상품과 같은 묶음으로 잡혔다.
 *
 * 용량 표기가 '+'로 **곧바로** 이어진 경우만 합산한다("120ml + 80ml" → 200ml). 사이에
 * 다른 단어가 끼어 있으면("샴푸 500ml + 트리트먼트 300ml") 서로 다른 품목일 수 있으므로
 * 건드리지 않는다 — 합치는 쪽이 틀렸을 때의 피해가 더 크다. 부피와 무게가 섞여 있으면
 * 역시 합산하지 않는다.
 */
function sumPlusJoinedSizes(name: string, sizes: RegExpMatchArray[], unitBase: number) {
  if (sizes.length < 2) return null;
  const group = [sizes.at(-1)!];
  for (let index = sizes.length - 1; index > 0; index -= 1) {
    const right = sizes[index]!;
    const left = sizes[index - 1]!;
    if (left.index === undefined || right.index === undefined) break;
    const between = name.slice(left.index + left[0].length, right.index);
    if (!/^\s*\+\s*$/.test(between)) break;
    group.unshift(left);
  }
  if (group.length < 2) return null;

  const parts = group.map(match => normalizeSize(normalizeNumber(match[1]!), match[2]!, unitBase));
  const measureUnit = parts[0]!.measureUnit;
  if (parts.some(part => part.measureUnit !== measureUnit)) return null;
  const amount = parts.reduce((total, part) => total + part.amount, 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const base = parts.at(-1)!;
  // 합산값은 항상 ml·g으로 환산된 값이므로 표시 단위도 환산 단위를 그대로 쓴다
  // ("1L + 500ml" → 1500ml). L 표기를 그대로 두면 "1500L"이 되어버린다.
  return { ...base, amount, displayUnit: measureUnit };
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
  const unitBase = beautyProduct ? 10 : 100;
  const bundled = sumPlusJoinedSizes(name, sizes, unitBase);
  const normalized = bundled ?? normalizeSize(normalizeNumber(size[1]), size[2], unitBase);
  if (!Number.isFinite(normalized.amount) || normalized.amount <= 0) {
    if (!hasBareQuantitySignal) return { variantLabel: null, unitPrice: null, unitLabel: null, quantity: null, sizeAmount: null, measureUnit: null };
    return { variantLabel: `${quantityCount}${quantityUnit}`, unitPrice: null, unitLabel: null, quantity: quantityCount, sizeAmount: null, measureUnit: null };
  }

  const effectiveQuantity = quantityCount ?? 1;
  const sizeDisplay = bundled
    ? `${roundMeasure(bundled.amount)}${bundled.displayUnit}`
    : `${size[1]}${normalized.displayUnit}`;
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
 * "10ml", "100g", "1kg" 같은 단가 기준 표기에서 환산 기준값과 단위를 읽는다.
 * "1kg당"이면 1000g 기준이라는 뜻이다.
 */
export function parseUnitLabelBasis(unitLabel: string | null | undefined) {
  if (!unitLabel) return null;
  const match = Array.from(unitLabel.matchAll(SIZE_PATTERN)).at(0);
  if (!match?.[1] || !match[2]) return null;
  const normalized = normalizeSize(normalizeNumber(match[1]), match[2], 100);
  if (!Number.isFinite(normalized.amount) || normalized.amount <= 0) return null;
  return { base: roundMeasure(normalized.amount), measureUnit: normalized.measureUnit };
}

/**
 * 저장된 옵션 값으로 단가를 계산한다.
 *
 * 2026-10-01: 저장 경로 두 곳이 단가를 `현재가 ÷ 수량`으로 계산하고 있었다. 용량을
 * 아예 쓰지 않으면서 라벨만 "10ml당"을 붙이니, 40ml짜리 6,000원 상품이 "10ml당
 * 6,000원"(실제 1,500원)으로 저장됐다. 수량만 다른 묶음들이 전부 같은 단가로 찍히는
 * 것도 같은 원인이다(2개 38,600원·3개 57,900원이 모두 "10ml당 19,300원").
 *
 * unitLabel은 두 가지 뜻으로 쓰인다 — 자동 파싱이 넣는 정규화 기준("10ml"/"100g")과,
 * 관리자가 "포장 하나 전체 용량"으로 직접 타이핑한 값("1kg"). 이 식은 둘 다 올바르게
 * 다룬다. 라벨이 가리키는 기준량만큼의 가격을 내놓기 때문이다. unitLabel "80ml",
 * 용량 80ml이면 "80ml당 = 현재가" 그대로가 되고, unitLabel "10ml", 용량 40ml이면
 * 현재가의 1/4이 된다.
 *
 * 용량이나 기준을 읽지 못하면 null을 돌려준다. 틀린 단가를 보여주는 것보다 단가를
 * 숨기는 쪽이 낫다 — 사용자가 상품을 고르는 데 직접 쓰는 숫자다.
 */
export function computeStoredUnitPrice(input: {
  price: number | null | undefined;
  variantLabel: string | null | undefined;
  quantity: number | null | undefined;
  unitLabel: string | null | undefined;
}) {
  const price = input.price;
  if (!price || !Number.isFinite(price) || price <= 0) return null;
  const basis = parseUnitLabelBasis(input.unitLabel);
  if (!basis) return null;
  const measure = parseVariantLabelMeasure(input.variantLabel ?? null);
  if (!measure.sizeAmount || !measure.measureUnit) return null;
  // 부피 기준 라벨에 무게 용량을 나누는 식의 짝 어긋남을 막는다.
  if (measure.measureUnit !== basis.measureUnit) return null;
  const quantity = input.quantity && input.quantity > 0 ? input.quantity : 1;
  const totalAmount = measure.sizeAmount * quantity;
  if (!(totalAmount > 0)) return null;
  return Math.round((price * basis.base) / totalAmount);
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
