export type MergeComparableProduct = {
  id: number;
  externalProductId: string;
  name: string;
  variantLabel: string | null;
  unitLabel?: string | null;
  quantity?: number | null;
  packSize?: string | null;
  currentPrice: number;
};

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^0-9a-z가-힣]+/g, "");
}

export function getSkuParts(externalProductId: string) {
  return externalProductId.split(":").map(value => value.trim()).filter(Boolean);
}

export function isLegacyPageProduct(product: MergeComparableProduct) {
  return getSkuParts(product.externalProductId).length === 1;
}

export function isExactOptionSku(product: MergeComparableProduct) {
  const parts = getSkuParts(product.externalProductId);
  return parts.length >= 3 && parts.slice(0, 3).every(value => /^\d+$/.test(value));
}

function productPageId(product: MergeComparableProduct) {
  return getSkuParts(product.externalProductId)[0] ?? "";
}

/** 같은 상품 페이지의 같은 구성·가격인 레거시 행과 정확 옵션 SKU만 병합 후보로 인정한다. */
export function getSafeMergeDirection(first: MergeComparableProduct, second: MergeComparableProduct) {
  const source = isLegacyPageProduct(first) && isExactOptionSku(second)
    ? first
    : isLegacyPageProduct(second) && isExactOptionSku(first)
      ? second
      : null;
  const target = source === first ? second : source === second ? first : null;
  if (!source || !target) return null;
  const sameProduct = productPageId(source) === productPageId(target)
    && normalize(source.name) === normalize(target.name)
    && normalize(source.variantLabel) === normalize(target.variantLabel)
    && normalize(source.unitLabel) === normalize(target.unitLabel)
    && (source.quantity ?? null) === (target.quantity ?? null)
    && normalize(source.packSize) === normalize(target.packSize)
    && source.currentPrice === target.currentPrice;
  return sameProduct ? { source, target } : null;
}

export function listSafeMergeCandidates<T extends MergeComparableProduct>(products: T[]) {
  const groups = new Map<string, T[]>();
  for (const product of products) {
    const pageId = productPageId(product);
    if (!pageId) continue;
    const key = `${pageId}|${normalize(product.name)}|${normalize(product.variantLabel)}|${normalize(product.unitLabel)}|${product.quantity ?? ""}|${normalize(product.packSize)}|${product.currentPrice}`;
    groups.set(key, [...(groups.get(key) ?? []), product]);
  }
  const candidates: Array<{ source: T; target: T }> = [];
  for (const group of Array.from(groups.values())) {
    const legacy = group.filter(isLegacyPageProduct);
    const exact = group.filter(isExactOptionSku);
    for (const source of legacy) for (const target of exact) candidates.push({ source, target });
  }
  return candidates;
}
