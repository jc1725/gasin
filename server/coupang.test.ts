import { describe, expect, it } from "vitest";
import { getGoldBoxProducts, isTransientCoupangGatewayStatus, retryTransientCoupangRequest } from "./coupang";

describe("Coupang transient gateway retry", () => {
  it("retries a 504 gateway response once before returning the second response", async () => {
    let calls = 0;
    const response = await retryTransientCoupangRequest(async () => {
      calls += 1;
      return { status: calls === 1 ? 504 : 200, marker: calls };
    }, 0);

    expect(response).toEqual({ status: 200, marker: 2 });
    expect(calls).toBe(2);
  });

  it("only treats gateway 502·503·504 responses as transient", () => {
    expect([502, 503, 504].every(isTransientCoupangGatewayStatus)).toBe(true);
    expect([400, 401, 403, 429, 500].some(isTransientCoupangGatewayStatus)).toBe(false);
  });
});

const describeWhenCoupangLiveTestEnabled = process.env.GASYN_ENABLE_COUPANG_LIVE_TEST === "true" ? describe : describe.skip;

describeWhenCoupangLiveTestEnabled("Coupang Partners credentials", () => {
  it("authenticates a lightweight GoldBox request with configured server secrets", async () => {
    const products = await getGoldBoxProducts();
    expect(Array.isArray(products)).toBe(true);
  }, 20_000);
});
