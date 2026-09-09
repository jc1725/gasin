import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./SearchProducts.tsx", import.meta.url), "utf8");

describe("search product back navigation", () => {
  it("persists each submitted search result and restores it from the URL keyword", () => {
    expect(source).toContain("getSearchKeywordFromLocation(window.location.search)");
    expect(source).toContain('window.addEventListener("popstate", restoreBrowserSearch)');
    expect(source).toContain("loadSearchSnapshot<SearchResultSnapshot>(routeKeyword)");
    expect(source).toContain("saveSearchSnapshot(normalizedKeyword, result)");
    expect(source).toContain("getSearchLocation(normalizedKeyword)");
  });
});
