import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendMail: vi.fn(), createGmailTransport: vi.fn() }));

vi.mock("./gmailSender", async importOriginal => {
  const actual = await importOriginal<typeof import("./gmailSender")>();
  return { ...actual, createGmailTransport: mocks.createGmailTransport };
});
vi.mock("./_core/env", () => ({
  ENV: {
    gmailSmtpUsername: "owner@example.com",
    gmailSmtpAppPassword: "1234567890123456",
  },
}));

import { buildSearchQuotaAlertEmail, notifySearchQuotaExceeded, resetSearchQuotaAlertForTests } from "./searchQuotaAlert";

describe("search quota email alert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSearchQuotaAlertForTests();
    mocks.sendMail.mockResolvedValue({ messageId: "test-message" });
    mocks.createGmailTransport.mockReturnValue({ sendMail: mocks.sendMail });
  });

  it("builds a clear Korean email with the retry time", () => {
    const email = buildSearchQuotaAlertEmail({
      reason: "minute-limit",
      retryAt: new Date("2026-08-28T06:10:00.000Z"),
    });

    expect(email.subject).toContain("쿠팡 상품 검색 API 한도 초과");
    expect(email.text).toContain("안전 한도를 초과했습니다.");
    expect(email.text).toContain("다음 검색 가능 예상 시각");
    expect(email.html).toContain("상품 검색 API 한도 초과");
  });

  it("sends one alert and suppresses repeated alerts during the cooldown", async () => {
    const input = { reason: "minute-limit", retryAt: new Date("2026-08-28T06:10:00.000Z") };

    await expect(notifySearchQuotaExceeded(input)).resolves.toMatchObject({ sent: true, suppressed: false });
    await expect(notifySearchQuotaExceeded(input)).resolves.toEqual({ sent: false, suppressed: true });

    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: "owner@example.com",
      subject: "[가신] 쿠팡 상품 검색 API 한도 초과 안내",
    }));
  });

  // Railway Free/Trial/Hobby 플랜은 아웃바운드 SMTP를 차단해 465번 포트 연결이
  // "ETIMEDOUT"/"CONN"으로 타임아웃된다. 이런 발송 실패도 앱을 죽이지 않고
  // 실패 상태를 그대로 반환해야 한다(원인 설명은 describeGmailSmtpError가 맡는다).
  it("발송이 SMTP 타임아웃으로 실패해도 실패 상태를 반환할 뿐 예외를 던지지 않는다", async () => {
    const timeoutError = Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT", command: "CONN" });
    mocks.sendMail.mockRejectedValueOnce(timeoutError);

    await expect(notifySearchQuotaExceeded({ reason: "minute-limit", retryAt: new Date("2026-08-28T06:10:00.000Z") }))
      .resolves.toEqual({ sent: false, suppressed: false, failed: true });
  });
});
