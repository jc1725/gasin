import { describe, expect, it } from "vitest";
import { readThemePreference } from "./themePreference";

describe("readThemePreference", () => {
  it("restores valid light and dark preferences", () => {
    expect(readThemePreference("light")).toBe("light");
    expect(readThemePreference("dark")).toBe("dark");
  });

  it("falls back safely for missing or invalid stored values", () => {
    expect(readThemePreference(null)).toBe("light");
    expect(readThemePreference("blue")).toBe("light");
    expect(readThemePreference("invalid", "dark")).toBe("dark");
  });
});
