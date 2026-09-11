import { createGmailTransport, describeGmailSmtpError } from "./gmailSender";
import { ENV } from "./_core/env";

export const SEARCH_QUOTA_ALERT_COOLDOWN_MS = 15 * 60 * 1000;

let lastSearchQuotaAlertAt = 0;

export type SearchQuotaAlertInput = {
  reason: string;
  retryAt: Date;
};

export function buildSearchQuotaAlertEmail(input: SearchQuotaAlertInput) {
  const retryAt = new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(input.retryAt);
  const subject = "[가신] 쿠팡 상품 검색 API 한도 초과 안내";
  const text = [
    "가신의 쿠팡 상품 검색 요청이 안전 한도를 초과했습니다.",
    `초과 사유: ${input.reason}`,
    `다음 검색 가능 예상 시각: ${retryAt}`,
    "가격 갱신 작업과 API 예산을 보호하기 위해 사용자 검색은 잠시 제한됩니다.",
  ].join("\n");
  const html = `<!doctype html><html lang="ko"><body style="margin:0;background:#f4faf4;color:#183527;font-family:Arial,sans-serif"><main style="max-width:560px;margin:24px auto;padding:32px;background:#ffffff;border-radius:22px"><p style="margin:0 0 8px;color:#2d7d4d;font-weight:700;letter-spacing:.08em;font-size:12px">GASYN API NOTICE</p><h1 style="margin:0 0 16px;font-size:24px;line-height:1.35">상품 검색 API 한도 초과</h1><p style="margin:0;color:#526158;line-height:1.7">가신의 쿠팡 상품 검색 요청이 안전 한도를 초과했습니다.</p><section style="margin-top:20px;padding:18px;background:#f4faf4;border-radius:16px;color:#526158;line-height:1.8"><strong>초과 사유</strong><br />${input.reason}<br /><strong>다음 검색 가능 예상 시각</strong><br />${retryAt}</section><p style="margin:24px 0 0;color:#758078;font-size:12px;line-height:1.7">가격 갱신 작업과 API 예산을 보호하기 위해 사용자 검색은 일시 제한됩니다.</p></main></body></html>`;
  return { subject, text, html };
}

export async function notifySearchQuotaExceeded(input: SearchQuotaAlertInput) {
  const now = Date.now();
  if (now - lastSearchQuotaAlertAt < SEARCH_QUOTA_ALERT_COOLDOWN_MS) {
    return { sent: false as const, suppressed: true as const };
  }
  if (!ENV.gmailSmtpUsername || !ENV.gmailSmtpAppPassword) {
    console.warn("[Search quota alert] Gmail SMTP is not configured");
    return { sent: false as const, suppressed: false as const, skipped: true as const };
  }

  lastSearchQuotaAlertAt = now;
  try {
    const email = buildSearchQuotaAlertEmail(input);
    const transport = await createGmailTransport();
    await transport.sendMail({
      from: `가신 시스템 알림 <${ENV.gmailSmtpUsername}>`,
      to: ENV.gmailSmtpUsername,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    return { sent: true as const, suppressed: false as const };
  } catch (error) {
    console.warn("[Search quota alert] Failed to send email:", describeGmailSmtpError(error));
    return { sent: false as const, suppressed: false as const, failed: true as const };
  }
}

export function resetSearchQuotaAlertForTests() {
  lastSearchQuotaAlertAt = 0;
}
