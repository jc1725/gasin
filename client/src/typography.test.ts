import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./index.css", import.meta.url), "utf8");

describe("Gasyn readable typography", () => {
  it("raises small shopping UI text to readable mobile sizes", () => {
    expect(source).toContain("#root .text-\\[10px\\]");
    expect(source).toContain("#root .text-\\[11px\\]");
    expect(source).toContain("font-size: 0.8125rem !important;");
    expect(source).toContain("font-size: 0.875rem !important;");
    expect(source).toContain("font-size: 1rem !important;");
  });
});

// The global overrides intentionally keep small labels readable on mobile while preserving hierarchy.
