import { getProductMetaTags } from "./productMeta";

function clean(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toLoosePattern(value: string) {
  return escapeRegExp(value)
    .replace(/×/g, "(?:x|×)")
    .replace(/\s+/g, "\\s*");
}

/** 제목에는 상품명만 남기고, 중복된 옵션·용량·수량은 아래 전용 표시 영역으로 분리한다. */
export function getProductDisplayName(name: string | null | undefined, variantLabel: string | null | undefined, unitLabel?: string | null) {
  const productName = clean(name);
  const variant = clean(variantLabel);
  if (!productName || !variant || variant === "가신 수집기 상품") return productName;

  const meta = getProductMetaTags(variant, unitLabel);
  const productTokens = [meta.capacity, meta.packSize, meta.quantity].filter((value): value is string => Boolean(value));
  const hasVariantInName = new RegExp(toLoosePattern(variant), "i").test(productName);
  const tokenOccurrences = productTokens.reduce((count, token) => count + (productName.match(new RegExp(toLoosePattern(token), "gi"))?.length ?? 0), 0);
  if (!hasVariantInName && tokenOccurrences < 2) return productName;

  let displayName = productName.replace(new RegExp(toLoosePattern(variant), "gi"), " ");
  for (const token of productTokens) {
    displayName = displayName.replace(new RegExp(`(?:\\s*[,·|/]\\s*|\\s+)${toLoosePattern(token)}(?=\\s*(?:[,·|/]|$))`, "gi"), " ");
  }
  const normalized = displayName.replace(/\s*[,·|/]\s*/g, " ").replace(/\s+/g, " ").trim();
  return normalized || productName;
}

/** 옵션 문구에서는 실제 옵션명만 남기고 용량·포장·수량은 전용 태그로 분리한다. */
export function getProductOptionDisplayLabel(variantLabel: string | null | undefined, unitLabel?: string | null) {
  const variant = clean(variantLabel);
  if (!variant || variant === "가신 수집기 상품") return null;

  const meta = getProductMetaTags(variant, unitLabel);
  let displayLabel = variant;
  for (const token of [meta.capacity, meta.packSize, meta.quantity].filter((value): value is string => Boolean(value))) {
    displayLabel = displayLabel.replace(new RegExp(`(?:^|[\\s,·|/]+)${toLoosePattern(token)}(?=\\s*(?:[,·|/×]|$))`, "gi"), " ");
  }
  const normalized = displayLabel.replace(/\s*[,·|/×]\s*/g, " ").replace(/\s+/g, " ").trim();
  return normalized || null;
}
