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
