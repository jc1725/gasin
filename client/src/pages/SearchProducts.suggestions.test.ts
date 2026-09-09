import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./SearchProducts.tsx", import.meta.url), "utf8");

describe("SearchProducts suggestions", () => {
  it("uses the stored-data suggestion query without triggering a product search on each keystroke", () => {
    expect(source).toContain("trpc.catalog.suggestions.useQuery");
    expect(source).toContain("suggestionInput.query.length >= 2");
    expect(source).toContain("search.mutate({ keyword: normalizedKeyword, limit: 10, refresh }, {");
  });

  it("offers an accessible dropdown with keyboard selection that runs the selected search", () => {
    expect(source).toContain('role="combobox"');
    expect(source).toContain('role="listbox"');
    expect(source).toContain("handleSuggestionKeyDown");
    expect(source).toContain("selectSuggestion(items[activeSuggestionIndex]!.keyword)");
  });
});
