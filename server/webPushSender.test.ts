import { describe, expect, it } from "vitest";
import { isExpiredPushSubscription } from "./webPushSender";

describe("web push subscription cleanup", () => {
  it("recognizes permanently expired push endpoints", () => {
    expect(isExpiredPushSubscription({ statusCode: 404 })).toBe(true);
    expect(isExpiredPushSubscription({ statusCode: 410 })).toBe(true);
    expect(isExpiredPushSubscription({ statusCode: 429 })).toBe(false);
  });
});
