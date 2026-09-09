import { describe, expect, it } from "vitest";
import { buildPriceAlertEmail } from "./gmailSender";

describe("target price Gmail alert", () => {
  it("uses a target-price subject and includes the configured threshold", () => {
    const email = buildPriceAlertEmail({
      to: "buyer@gmail.com",
      productName: "테스트 커피",
      currentPrice: 12_900,
      lowestPrice24h: 12_700,
      checkedAt: new Date("2026-08-18T01:00:00.000Z"),
      affiliateUrl: "https://link.coupang.com/a/test",
      unsubscribeUrl: "https://gasyn.example/api/alerts/unsubscribe?token=signed",
      alertKind: "target_price",
      targetPrice: 13_000,
    });

    expect(email.subject).toContain("목표 가격 도달");
    expect(email.text).toContain("목표가: 13,000원");
    expect(email.html).toContain("목표 가격에 도달했어요");
    expect(email.html).toContain("가신 최저가 알림");
    expect(email.html).not.toContain("GASYN PRICE ALERT");
  });
});
