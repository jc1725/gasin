import { afterEach, describe, expect, it, vi } from "vitest";
import { getSearchKeywordFromLocation, getSearchLocation, loadSearchSnapshot, saveSearchSnapshot } from "./searchNavigationState";

afterEach(() => vi.unstubAllGlobals());

describe("search navigation state", () => {
  it("reads the previous keyword from the search URL used by browser back navigation", () => {
    expect(getSearchKeywordFromLocation("/search?q=%EC%BC%80%EB%9D%BC%EC%8A%A4%ED%83%80%EC%A6%88")).toBe("케라스타즈");
    expect(getSearchKeywordFromLocation("/search")).toBe("");
  });

  it("creates an encoded search URL that preserves the submitted keyword in history", () => {
    expect(getSearchLocation("피지오겔 크림")).toBe("/search?q=%ED%94%BC%EC%A7%80%EC%98%A4%EA%B2%94%20%ED%81%AC%EB%A6%BC");
  });

  it("stores a submitted result so the same URL can restore it after returning from product detail", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const snapshot = { products: [{ id: 1, name: "테스트 상품" }], source: "database" };
    saveSearchSnapshot("테스트", snapshot);
    expect(loadSearchSnapshot<typeof snapshot>("테스트")).toEqual(snapshot);
  });
});
