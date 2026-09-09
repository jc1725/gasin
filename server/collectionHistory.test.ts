import { describe, expect, it } from "vitest";
import { shouldStoreCollectedPrice } from "./db";

describe("collected price history time series", () => {
  it("stores every observation even when a direct predecessor has the same price", () => {
    expect(shouldStoreCollectedPrice(undefined, 12900)).toBe(true);
    expect(shouldStoreCollectedPrice(12900, 12900)).toBe(true);
    expect(shouldStoreCollectedPrice(12900, 11900)).toBe(true);
  });
});
