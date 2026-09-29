import { describe, expect, it } from "vitest";
import { createGmailTransport } from "./gmailSender";

// 실제 Gmail 계정에 SMTP로 접속해 앱 비밀번호가 살아있는지 확인하는 통합 테스트다.
// .env에 자격증명이 없는 개발 환경에서는 건너뛴다(예전엔 항상 실패했다).
const hasGmailCredentials = Boolean(process.env.GMAIL_SMTP_USERNAME?.trim() && process.env.GMAIL_SMTP_APP_PASSWORD?.trim());

describe.skipIf(!hasGmailCredentials)("Gmail SMTP credentials", () => {
  it("authenticates with the configured Gmail app password", async () => {
    const user = process.env.GMAIL_SMTP_USERNAME?.trim();
    const pass = process.env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s/g, "");
    expect(user).toMatch(/^[^\s@]+@gmail\.com$/i);
    expect(pass).toMatch(/^.{16}$/);

    const transport = await createGmailTransport();
    await expect(transport.verify()).resolves.toBe(true);
  }, 25_000);
});
