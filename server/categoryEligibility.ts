const CATEGORY_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "숙박", pattern: /숙박|호텔|리조트|펜션|모텔/i },
  { label: "여행", pattern: /여행|항공권|렌터카|렌트카|투어/i },
  { label: "티켓", pattern: /티켓|입장권|이용권/i },
];

const NAME_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "숙박", pattern: /숙박권|호텔\s*숙박|리조트\s*숙박|펜션\s*숙박|모텔\s*숙박/i },
  { label: "여행", pattern: /항공권|렌터카|렌트카|여행\s*패키지|여행상품/i },
  { label: "티켓", pattern: /입장권|이용권|티켓|투어/i },
];

/**
 * 쿠팡 상품의 category/pageType/name을 기준으로 가격 추적 제외 여부를 판정합니다.
 * categoryName/pageType은 우선 사용하고, API가 카테고리를 비워 보내는 경우에만
 * 명확한 숙박·여행·티켓 상품명 패턴을 보조 판정합니다.
 */
export function getExcludedTrackingCategory(value: {
  categoryName?: string | null;
  pageType?: string | null;
  productName?: string | null;
  name?: string | null;
}) {
  const categoryText = `${value.categoryName ?? ""} ${value.pageType ?? ""}`.trim();
  const nameText = `${value.productName ?? value.name ?? ""}`.trim();
  const categoryMatch = CATEGORY_PATTERNS.find(item => item.pattern.test(categoryText));
  if (categoryMatch) return categoryMatch.label;
  const nameMatch = NAME_PATTERNS.find(item => item.pattern.test(nameText));
  return nameMatch?.label ?? null;
}

export function isExcludedTrackingCategory(value: Parameters<typeof getExcludedTrackingCategory>[0]) {
  return Boolean(getExcludedTrackingCategory(value));
}

export const EXCLUDED_TRACKING_CATEGORY_LABEL = "숙박·여행·티켓";
