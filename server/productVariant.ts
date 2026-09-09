export type ProductVariantInfo = {
  variantLabel: string | null;
  unitPrice: number | null;
  unitLabel: string | null;
};

const SIZE_PATTERN = /(\d+(?:[.,]\d+)?)\s*(ml|mL|ML|L|l|g|G|kg|KG|Kg)/g;
const QUANTITY_PATTERN = /(\d+)\s*(개입|개|팩|입|병|캔|봉|박스|세트|롤|매)/g;

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
  const sizes = Array.from(name.matchAll(SIZE_PATTERN));
  if (sizes.length === 0) return { variantLabel: null, unitPrice: null, unitLabel: null };

  const size = sizes.at(-1);
  if (!size?.[1] || !size[2]) return { variantLabel: null, unitPrice: null, unitLabel: null };
  const beautyProduct = /뷰티|스킨|클렌징|크림|세럼|앰플|향수|선크림|샴푸|바디워시/i.test(`${categoryName ?? ""} ${name}`);
  const normalized = normalizeSize(normalizeNumber(size[1]), size[2], beautyProduct ? 10 : 100);
  if (!Number.isFinite(normalized.amount) || normalized.amount <= 0) {
    return { variantLabel: null, unitPrice: null, unitLabel: null };
  }

  const quantities = Array.from(name.matchAll(QUANTITY_PATTERN));
  const quantity = quantities.at(-1);
  const quantityCount = quantity?.[1] ? Number(quantity[1]) : 1;
  const quantityUnit = quantity?.[2] ?? "";
  const sizeDisplay = `${size[1]}${normalized.displayUnit}`;
  const variantLabel = quantity ? `${sizeDisplay} × ${quantityCount}${quantityUnit}` : sizeDisplay;
  const totalAmount = normalized.amount * quantityCount;

  return {
    variantLabel,
    unitPrice: Math.round((price * normalized.unitBase) / totalAmount),
    unitLabel: normalized.unitLabel,
  };
}
