export type SearchSuggestion = {
  keyword: string;
  source: "product" | "history";
};

type ProductCandidate = { name: string; variantLabel?: string | null };
type HistoryCandidate = { keyword: string };

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export function buildSearchSuggestions(query: string, products: ProductCandidate[], history: HistoryCandidate[], limit = 6): SearchSuggestion[] {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length < 2) return [];
  const unique = new Map<string, SearchSuggestion>();
  const add = (keyword: string, source: SearchSuggestion["source"]) => {
    const trimmed = keyword.trim().replace(/\s+/g, " ");
    const key = normalize(trimmed);
    if (!trimmed || !key.includes(normalizedQuery) || unique.has(key)) return;
    unique.set(key, { keyword: trimmed.slice(0, 160), source });
  };

  products.forEach(product => add(product.name, "product"));
  history.forEach(item => add(item.keyword, "history"));
  return Array.from(unique.values())
    .sort((left, right) => {
      const leftStarts = normalize(left.keyword).startsWith(normalizedQuery) ? 0 : 1;
      const rightStarts = normalize(right.keyword).startsWith(normalizedQuery) ? 0 : 1;
      if (leftStarts !== rightStarts) return leftStarts - rightStarts;
      if (left.source !== right.source) return left.source === "product" ? -1 : 1;
      return left.keyword.localeCompare(right.keyword, "ko-KR");
    })
    .slice(0, Math.min(Math.max(limit, 1), 8));
}
