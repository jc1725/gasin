import type { Express, Request, Response } from "express";
import { unsubscribeFavoriteForPriceAlerts } from "./db";
import { parsePriceAlertUnsubscribeToken } from "./priceAlertUnsubscribe";

function renderPage(title: string, detail: string, status: number) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | 가신</title></head><body style="margin:0;background:#f4faf4;color:#183527;font-family:Arial,sans-serif"><main style="max-width:480px;margin:64px auto;padding:32px;background:#fff;border-radius:20px;text-align:center;box-shadow:0 12px 30px rgba(24,53,39,.10)"><h1 style="margin:0 0 16px;font-size:24px">${title}</h1><p style="margin:0;line-height:1.7;color:#53645a">${detail}</p><a href="/favorites" style="display:inline-block;margin-top:24px;padding:12px 18px;border-radius:12px;background:#176b3a;color:#fff;text-decoration:none;font-weight:700">찜한상품으로 돌아가기</a></main></body></html>`;
}

export function registerPriceAlertRoutes(app: Express) {
  app.get("/api/alerts/unsubscribe", async (req: Request, res: Response) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const payload = parsePriceAlertUnsubscribeToken(token);
    if (!payload) return res.status(400).type("html").send(renderPage("유효하지 않은 해제 링크입니다", "메일에서 받은 최신 찜 해제 링크를 다시 열어 주세요.", 400));

    try {
      const removed = await unsubscribeFavoriteForPriceAlerts(payload);
      const detail = removed
        ? "해당 상품의 찜과 이메일 가격 알림을 해제했습니다."
        : "이미 찜과 이메일 가격 알림이 해제되어 있습니다.";
      return res.status(200).type("html").send(renderPage("알림을 해제했습니다", detail, 200));
    } catch (error) {
      console.error("[Price alert unsubscribe]", error);
      return res.status(500).type("html").send(renderPage("알림 해제에 실패했습니다", "잠시 후 다시 시도하거나 찜한상품 화면에서 직접 해제해 주세요.", 500));
    }
  });
}
