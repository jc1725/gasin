// 2026-09-25: 관리자 수동 확인 전용 직접 주소. 고객 구매 버튼·수집기 자동 순회는
// 파트너스 딥링크만 쓰지만, 딥링크가 생성되기 전 상품은 관리자가 이 주소로 직접
// 들어가 옵션을 확인해야 다시 살릴 수 있다.
export function createCoupangProductUrl(productId: string, itemId?: string | null, vendorItemId?: string | null) {
  const normalizedProductId = productId.trim();
  if (!normalizedProductId) return null;
  const params = new URLSearchParams();
  if (itemId?.trim()) params.set("itemId", itemId.trim());
  if (vendorItemId?.trim()) params.set("vendorItemId", vendorItemId.trim());
  const query = params.toString();
  return `https://www.coupang.com/vp/products/${encodeURIComponent(normalizedProductId)}${query ? `?${query}` : ""}`;
}

export function createCoupangSearchUrl(keyword: string, qualifiers: Array<string | null | undefined> = []) {
  const terms = [keyword, ...qualifiers]
    .map(value => value?.trim().replace(/\s+/g, " ") ?? "")
    .filter(Boolean)
    .reduce<string[]>((uniqueTerms, term) => {
      const normalizedTerm = term.replace(/[\s,·×xX]/g, "").toLowerCase();
      const isAlreadyIncluded = uniqueTerms.some(existing => {
        const normalizedExisting = existing.replace(/[\s,·×xX]/g, "").toLowerCase();
        return normalizedExisting.includes(normalizedTerm);
      });
      if (!isAlreadyIncluded) uniqueTerms.push(term);
      return uniqueTerms;
    }, []);
  const query = terms.join(" ").slice(0, 120);
  return `https://www.coupang.com/np/search?q=${encodeURIComponent(query)}`;
}
