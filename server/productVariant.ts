export type ProductVariantInfo = {
  variantLabel: string | null;
  unitPrice: number | null;
  unitLabel: string | null;
  quantity: number | null;
};

const SIZE_PATTERN = /(\d+(?:[.,]\d+)?)\s*(ml|mL|ML|L|l|g|G|kg|KG|Kg)/g;
const QUANTITY_PATTERN = /(\d+)\s*(개입|개|팩|입|병|캔|봉|박스|세트|롤|매)/g;
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
  if (lower === "l") return { amount: value * 1000, displayUnit: "L", unitLabel: `${unitBase}ml`, unitBase };
  if (lower === "kg") return { amount: value * 1000, displayUnit: "kg", unitLabel: "100g", unitBase: 100 };
  if (lower === "ml") return { amount: value, displayUnit: "ml", unitLabel: `${unitBase}ml`, unitBase };
  return { amount: value, displayUnit: "g", unitLabel: "100g", unitBase: 100 };
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
    if (!hasBareQuantitySignal) return { variantLabel: null, unitPrice: null, unitLabel: null, quantity: null };
    return { variantLabel: `${quantityCount}${quantityUnit}`, unitPrice: null, unitLabel: null, quantity: quantityCount };
  }

  const beautyProduct = /뷰티|스킨|클렌징|크림|세럼|앰플|향수|선크림|샴푸|바디워시/i.test(`${categoryName ?? ""} ${name}`);
  const normalized = normalizeSize(normalizeNumber(size[1]), size[2], beautyProduct ? 10 : 100);
  if (!Number.isFinite(normalized.amount) || normalized.amount <= 0) {
    if (!hasBareQuantitySignal) return { variantLabel: null, unitPrice: null, unitLabel: null, quantity: null };
    return { variantLabel: `${quantityCount}${quantityUnit}`, unitPrice: null, unitLabel: null, quantity: quantityCount };
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
  };
}
