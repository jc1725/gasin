import { describe, expect, it } from "vitest";
import { CoupangApiTimeoutError, withCoupangRequestTimeout } from "./coupang";

describe("Coupang API request timeout", () => {
  it("fails a stalled request instead of leaving a price refresh job running indefinitely", async () => {
    const stalled = new Promise<never>(() => undefined);
    await expect(withCoupangRequestTimeout(stalled, "request", 1)).rejects.toBeInstanceOf(CoupangApiTimeoutError);
  });
});
