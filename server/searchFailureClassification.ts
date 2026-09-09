export type MissingSearchFailureCategory =
  | "brand"
  | "product_type"
  | "option"
  | "relevance"
  | "not_found"
  | "product_id"
  | "unknown";

export type MissingSearchClassification = {
  category: MissingSearchFailureCategory;
  label: string;
  reason: string;
  optionSummary: string | null;
};

const OPTION_TOKEN = /^(?:\d+(?:\.\d+)?\s?(?:ml|mL|l|g|kg|mg|개|입|정|팩|롤|장|세트)|\d+(?:\.\d+)?(?:ml|l|g|kg|mg))$/i;
const PRODUCT_TYPE_TOKENS = ["크림", "클렌징", "클렌징폼", "폼클렌저", "샴푸", "세제", "두유", "물티슈", "앰플", "에센스", "마스크팩", "냄비", "청소기"];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^0-9a-z가-힣]+/g, "");
}

export function classifyMissingSearch(keyword: string): MissingSearchClassification {
  const trimmedKeyword = keyword.trim();
  if (/^\d{6,14}$/.test(trimmedKeyword)) {
    return { category: "product_id", label: "상품 ID 검색어", reason: "상품명 검색이 아니라 숫자형 쿠팡 상품 ID가 검색 실패 이력에 기록된 항목입니다.", optionSummary: null };
  }
  const tokens = trimmedKeyword.split(/\s+/).filter(Boolean);
  const optionTokens = tokens.filter(token => OPTION_TOKEN.test(token.replace(/[×x,]/gi, "")));
  const normalized = normalize(keyword);
  const hasProductType = PRODUCT_TYPE_TOKENS.some(token => normalized.includes(normalize(token)));
  const coreTokens = tokens.filter(token => !OPTION_TOKEN.test(token.replace(/[×x,]/gi, "")));

  if (optionTokens.length > 0 && coreTokens.length <= 1) {
    return { category: "option", label: "옵션·용량·수량", reason: "상품명보다 옵션·용량·수량 조건이 중심인 검색어입니다.", optionSummary: optionTokens.join(" · ") };
  }
  if (optionTokens.length > 0) {
    return { category: "option", label: "상품명 + 옵션", reason: "상품명은 있으나 용량·수량·구성 조건이 API 결과와 다를 수 있습니다.", optionSummary: optionTokens.join(" · ") };
  }
  if (hasProductType) {
    return { category: "product_type", label: "상품 유형·표기", reason: "상품 유형은 포함됐지만 쿠팡 상품명의 표기 변형·동의어가 다를 수 있습니다.", optionSummary: null };
  }
  if (tokens.length >= 2) {
    return { category: "brand", label: "브랜드·상품명", reason: "브랜드 또는 상품명 표기가 API 상품명과 달라 매칭되지 않았을 가능성이 있습니다.", optionSummary: null };
  }
  return { category: "unknown", label: "원인 분석 필요", reason: "검색어만으로 원인을 확정하기 어려워 API 응답 로그 확인이 필요합니다.", optionSummary: null };
}

export function classifyMissingSearchResult(keyword: string, apiMessage?: string | null) {
  if (apiMessage?.includes("무관한 결과")) {
    const base = classifyMissingSearch(keyword);
    return { ...base, category: "relevance" as const, label: "관련도 탈락", reason: "쿠팡 API는 응답했지만 브랜드·상품 유형·옵션 관련도 기준을 통과한 결과가 없습니다." };
  }
  if (apiMessage?.includes("최신 검색 결과에") || apiMessage?.includes("일치하는 상품이 없습니다")) {
    const base = classifyMissingSearch(keyword);
    return { ...base, category: "not_found" as const, label: "API 검색 결과 없음", reason: "쿠팡 API 응답에 검색어와 일치하는 상품이 없습니다." };
  }
  return classifyMissingSearch(keyword);
}
