import nodemailer from "nodemailer";
import { ENV } from "./_core/env";

export type PriceAlertEmailInput = {
  to: string;
  productName: string;
  currentPrice: number;
  lowestPrice24h: number;
  checkedAt: Date;
  affiliateUrl: string;
  unsubscribeUrl: string;
  alertKind?: "lowest_24h" | "target_price";
  targetPrice?: number;
};

function formatWon(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function validateConfig() {
  if (!/^[^\s@]+@gmail\.com$/i.test(ENV.gmailSmtpUsername)) {
    throw new Error("Gmail SMTP 사용자명이 올바른 Gmail 주소가 아닙니다.");
  }
  if (ENV.gmailSmtpAppPassword.length !== 16) {
    throw new Error("Gmail SMTP 앱 비밀번호는 공백을 제외한 16자리여야 합니다.");
  }
}

export function createGmailTransport() {
  validateConfig();
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: ENV.gmailSmtpUsername,
      pass: ENV.gmailSmtpAppPassword,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
}

export function buildPriceAlertEmail(input: PriceAlertEmailInput) {
  const productName = escapeHtml(input.productName);
  const currentPrice = formatWon(input.currentPrice);
  const lowestPrice24h = formatWon(input.lowestPrice24h);
  const targetPrice = input.targetPrice ? formatWon(input.targetPrice) : null;
  const checkedAt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(input.checkedAt);
  const isTargetPriceAlert = input.alertKind === "target_price";
  const subject = isTargetPriceAlert ? `[가신] 목표 가격 도달 · ${input.productName}` : `[가신] 24시간 최저가 알림 · ${input.productName}`;
  const text = [
    isTargetPriceAlert ? `${input.productName}의 가격이 설정한 목표 가격에 도달했습니다.` : `${input.productName}의 가격이 최근 24시간 최저가에 도달했습니다.`,
    `현재가: ${currentPrice}`,
    isTargetPriceAlert ? `목표가: ${targetPrice}` : `24시간 최저가: ${lowestPrice24h}`,
    `확인 시각: ${checkedAt}`,
    `쿠팡에서 확인: ${input.affiliateUrl}`,
    `이 상품 알림 해제: ${input.unsubscribeUrl}`,
  ].join("\n");
  const html = `<!doctype html><html lang="ko"><body style="margin:0;background:#f4faf4;color:#183527;font-family:Arial,sans-serif"><main style="max-width:560px;margin:24px auto;padding:32px;background:#ffffff;border-radius:22px"><p style="margin:0 0 8px;color:#2d7d4d;font-weight:700;letter-spacing:.08em;font-size:12px">가신 최저가 알림</p><h1 style="margin:0 0 16px;font-size:24px;line-height:1.35">${isTargetPriceAlert ? "목표 가격에 도달했어요" : "24시간 최저가에 도달했어요"}</h1><p style="margin:0 0 24px;color:#526158;line-height:1.7"><strong style="color:#183527">${productName}</strong>의 가격을 확인했습니다.</p><section style="padding:18px;background:#f4faf4;border-radius:16px"><p style="margin:0 0 10px;color:#526158;font-size:13px">현재가</p><p style="margin:0;color:#176b3a;font-size:28px;font-weight:800">${currentPrice}</p><p style="margin:12px 0 0;color:#526158;font-size:14px">${isTargetPriceAlert ? `목표가 ${targetPrice}` : `최근 24시간 최저가 ${lowestPrice24h}`} · ${checkedAt} 확인</p></section><a href="${escapeHtml(input.affiliateUrl)}" style="display:block;margin-top:24px;padding:15px 18px;border-radius:12px;background:#176b3a;color:#ffffff;text-align:center;text-decoration:none;font-weight:700">쿠팡에서 상품 확인하기</a><p style="margin:24px 0 0;color:#758078;font-size:12px;line-height:1.7">이 메일은 상품을 찜할 때 동의한 가격 알림입니다. 더 이상 받고 싶지 않다면 <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#2d7d4d">이 상품의 찜과 알림을 해제</a>할 수 있습니다.</p></main></body></html>`;
  return { subject, text, html };
}

export async function sendPriceAlertEmail(input: PriceAlertEmailInput) {
  const email = buildPriceAlertEmail(input);
  const transport = createGmailTransport();
  return transport.sendMail({
    from: `가신 가격 알림 <${ENV.gmailSmtpUsername}>`,
    to: input.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}
