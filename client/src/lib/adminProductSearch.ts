export type AdminProductSearchItem = {
  name: string;
  externalProductId?: string;
  variantLabel: string | null;
  unitLabel: string | null;
  // 2026-09-17: 검색창에 상품의 수집 출처(예: "골드박스")를 입력해도 찾을 수 있도록
  // 추가. products.source 값을 그대로 넘기면 된다("goldbox"|"search"|"bestcategory"|
  // "collection"). 이 필드가 없는 목록(다른 화면에서 이 함수를 재사용하는 경우)에서는
  // 그냥 무시되고 기존처럼 이름·SKU·옵션만으로 검색된다.
  source?: string | null;
};

// source 값 하나당 사용자가 검색창에 입력할 법한 한글·영문 표현을 모두 나열.
// "골드박스 상품이 검색이 안 된다"는 문의를 계기로 추가됨 — 예전엔 검색이 상품명·
// SKU·옵션 텍스트만 봐서, 상품명에 우연히 "골드박스"라는 글자가 들어있지 않으면
// (실제로는 거의 항상 없음) 실제로 골드박스에서 수집된 상품이어도 절대 안 걸렸음.
const SOURCE_SEARCH_LABELS: Record<string, string[]> = {
  goldbox: ["골드박스", "goldbox"],
  search: ["검색", "search"],
  bestcategory: ["베스트카테고리", "베스트", "bestcategory"],
  collection: ["수집기", "확장", "collection"],
};

export function filterAdminProducts<T extends AdminProductSearchItem>(products: T[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  if (!normalizedQuery) return products;
  return products.filter(product => {
    const textFields = [product.name, product.externalProductId, product.variantLabel, product.unitLabel]
      .filter(Boolean)
      .some(value => value!.toLocaleLowerCase("ko-KR").includes(normalizedQuery));
    if (textFields) return true;
    const sourceLabels = product.source ? SOURCE_SEARCH_LABELS[product.source] : undefined;
    return sourceLabels?.some(label => label.toLocaleLowerCase("ko-KR").includes(normalizedQuery)) ?? false;
  });
}
