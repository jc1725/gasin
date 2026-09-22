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
