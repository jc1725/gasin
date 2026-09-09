import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./index.css", import.meta.url), "utf8");

describe("dark mode contrast", () => {
  it("keeps Gasyn green tokens and primary fixed text colors readable on dark surfaces", () => {
    expect(source).toContain("--gasyn-primary: #58bd7d");
    expect(source).toContain(".dark [class*=\"text-[#25362a]\"]");
    expect(source).toContain("color: #f1f7f2 !important");
    expect(source).toContain("color: #c7d8cb !important");
    expect(source).toContain("color: #9fe7b8 !important");
  });

  it("adapts pale cards, warning cards, and input borders for dark mode", () => {
    expect(source).toContain("background-color: #173522 !important");
    expect(source).toContain("background-color: #382f17 !important");
    expect(source).toContain("border-color: #3b6045 !important");
  });
});
