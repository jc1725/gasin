export type CollectorMetadataInput = {
  optionName?: string | null;
  capacityText?: string | null;
  quantity?: number | null;
  packSize?: string | null;
};

export type CollectorProductMetadata = {
  variantLabel?: string;
  quantity?: number;
  packSize?: string;
};

function clean(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || null;
}

export function buildCollectorProductMetadata(input: CollectorMetadataInput): CollectorProductMetadata {
  const optionName = clean(input.optionName);
  const capacity = clean(input.capacityText) ?? optionName?.match(/\b\d+(?:\.\d+)?\s?(?:ml|mL|l|L|g|kg|mg)\b/i)?.[0] ?? null;
  const quantity = Number.isInteger(input.quantity) && (input.quantity ?? 0) > 0 ? Number(input.quantity) : undefined;
  const packSize = clean(input.packSize);
  const variantParts = [capacity, quantity ? `${quantity}개` : null, packSize].filter(Boolean);

  return {
    ...(variantParts.length > 0 ? { variantLabel: variantParts.join(" × ") } : {}),
    ...(quantity ? { quantity } : {}),
    ...(packSize ? { packSize } : {}),
  };
}

export function hasMissingCollectorMetadata(product: { variantLabel?: string | null; quantity?: number | null; packSize?: string | null }, metadata: CollectorProductMetadata) {
  return Boolean(
    (metadata.variantLabel && !product.variantLabel) ||
    (metadata.quantity && !product.quantity) ||
    (metadata.packSize && !product.packSize),
  );
}
