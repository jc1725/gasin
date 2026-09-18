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

// 2026-09-18: 쿠팡트래블(trip.coupang.com) 상품은 카테고리명이 비어 있거나
// (골드박스/베스트카테고리 공식 API 경로) pageType만 있고(수집기 경로)
// 상품명에도 "숙박"이 붙지 않은 채로 "OO 호텔&리조트", "체크인시 랜덤배정"처럼
// 나오는 경우가 있어 CATEGORY_PATTERNS·NAME_PATTERNS를 다 피해간다. "호텔"·
// "리조트"·"펜션" 등을 이름 패턴에 그대로 추가하면 "호텔식 침구", "리조트룩
// 원피스", "여행용치약... 펜션 사우나 휴대용" 같은 실제 상품을 오탐 제외시키므로
// (2026-09 조사에서 실제로 확인됨) 대신 URL 자체가 trip.coupang.com인지만
// 별도로, 텍스트 패턴과 무관하게 확인한다 — 이 도메인의 상품은 예외 없이
// 숙박/여행 상품이라 오탐 위험이 없다.
function isTripCoupangUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname === "trip.coupang.com";
  } catch {
    return false;
  }
}

/**
 * 쿠팡 상품의 category/pageType/name/url을 기준으로 가격 추적 제외 여부를 판정합니다.
 * url이 trip.coupang.com이면 다른 조건과 무관하게 즉시 제외합니다. 그 외에는
 * categoryName/pageType을 우선 사용하고, API가 카테고리를 비워 보내는 경우에만
 * 명확한 숙박·여행·티켓 상품명 패턴을 보조 판정합니다.
 */
export function getExcludedTrackingCategory(value: {
  categoryName?: string | null;
  pageType?: string | null;
  productName?: string | null;
  name?: string | null;
  url?: string | null;
}) {
  if (isTripCoupangUrl(value.url)) return "숙박";
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
