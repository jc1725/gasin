import { describe, expect, it } from "vitest";
import { buildSearchSuggestions } from "./searchSuggestions";

describe("buildSearchSuggestions", () => {
  it("returns only matching, deduplicated candidates that already have stored products or successful searches", () => {
    expect(buildSearchSuggestions("생리", [
      { name: "좋은느낌 유기농 순면 생리대 중형" },
      { name: "좋은느낌 유기농 순면 생리대 중형" },
      { name: "코카콜라 제로" },
    ], [
      { keyword: "생리대" },
      { keyword: "생리대 추천" },
      { keyword: "코카콜라" },
    ])).toEqual([
      { keyword: "생리대", source: "history" },
      { keyword: "생리대 추천", source: "history" },
      { keyword: "좋은느낌 유기농 순면 생리대 중형", source: "product" },
    ]);
  });

  it("does not offer a request for one-character input", () => {
    expect(buildSearchSuggestions("생", [{ name: "생리대" }], [{ keyword: "생리대" }])).toEqual([]);
  });
});
