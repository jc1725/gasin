export type ProductMetaTags = {
  capacity: string | null;
  quantity: string | null;
  packSize: string | null;
};

function clean(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || null;
}

export function getProductMetaTags(
  variantLabel: string | null | undefined,
  unitLabel?: string | null,
  productName?: string | null,
  structuredQuantity?: number | null,
  structuredPackSize?: string | null,
): ProductMetaTags {
  const source = [clean(variantLabel), clean(productName)].filter((value): value is string => Boolean(value)).join(" · ");
  if (!source) return { capacity: null, quantity: null, packSize: null };

  const capacityMatch = source.match(/\b\d+(?:\.\d+)?\s?(?:ml|mL|리터|L|g|kg|mg|cm|mm)\b/i);
  const packSizeMatch = source.match(/(?:^|[\s·,/(])(\d{1,6})\s*(개입|팩입|매입|장입|포입|정입|봉입)(?![가-힣])/i);
  const quantityMatch = source.match(/(?:^|[\s·,/()])(?:수량\s*[:：]?\s*)?(\d+)\s*(?:개|입|팩|세트|매|장|롤|포|정)(?![가-힣])/i);

  return {
    capacity: clean(capacityMatch?.[0]) ?? (unitLabel && /(?:ml|리터|\bL\b|g|kg|mg)/i.test(unitLabel) ? clean(source) : null),
    quantity: structuredQuantity && structuredQuantity > 0 ? `${structuredQuantity}개` : quantityMatch ? `${quantityMatch[1]}개` : null,
    packSize: clean(structuredPackSize) ?? (packSizeMatch ? `${packSizeMatch[1]}${packSizeMatch[2]}` : null),
  };
}
