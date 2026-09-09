import { createHmac, timingSafeEqual } from "node:crypto";
import { ENV } from "./_core/env";

export type PriceAlertUnsubscribePayload = {
  userId: number;
  productId: number;
  favoriteId: number;
};

function signingKey() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is required to sign email unsubscribe links");
  return ENV.cookieSecret;
}

function sign(encodedPayload: string) {
  return createHmac("sha256", signingKey()).update(encodedPayload).digest("base64url");
}

export function createPriceAlertUnsubscribeToken(payload: PriceAlertUnsubscribePayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function parsePriceAlertUnsubscribeToken(token: string): PriceAlertUnsubscribePayload | null {
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) return null;
  const expectedSignature = sign(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<PriceAlertUnsubscribePayload>;
    if (!Number.isInteger(parsed.userId) || !Number.isInteger(parsed.productId) || !Number.isInteger(parsed.favoriteId)) return null;
    if ((parsed.userId ?? 0) < 1 || (parsed.productId ?? 0) < 1 || (parsed.favoriteId ?? 0) < 1) return null;
    return { userId: parsed.userId!, productId: parsed.productId!, favoriteId: parsed.favoriteId! };
  } catch {
    return null;
  }
}

export function buildPriceAlertUnsubscribeUrl(payload: PriceAlertUnsubscribePayload) {
  const token = createPriceAlertUnsubscribeToken(payload);
  return `${ENV.appBaseUrl}/api/alerts/unsubscribe?token=${encodeURIComponent(token)}`;
}
