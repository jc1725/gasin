import webpush from "web-push";
import * as db from "./db";
import { ENV } from "./_core/env";
import { getWebPushConfiguration } from "./webPushConfig";

export type TargetPricePushInput = {
  userId: number;
  productId: number;
  productName: string;
  currentPrice: number;
  targetPrice: number;
};

export type PushSendSummary = { sent: number; expired: number; failed: number };

export function isExpiredPushSubscription(error: unknown) {
  const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? Number((error as { statusCode?: unknown }).statusCode) : 0;
  return statusCode === 404 || statusCode === 410;
}

export async function sendTargetPricePushNotification(input: TargetPricePushInput): Promise<PushSendSummary> {
  const subscriptions = await db.listWebPushSubscriptionsForUser(input.userId);
  if (subscriptions.length === 0) return { sent: 0, expired: 0, failed: 0 };
  const { publicKey, privateKey, subject } = getWebPushConfiguration();
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const payload = JSON.stringify({
    title: "가신 목표가 도달",
    body: `${input.productName}\n현재 ${input.currentPrice.toLocaleString("ko-KR")}원 · 목표 ${input.targetPrice.toLocaleString("ko-KR")}원`,
    icon: "/manus-storage/gasyn-text-shortcut-icon-preview_1bf92205.png",
    tag: `gasyn-target-${input.productId}`,
    url: `${ENV.appBaseUrl}/product/${input.productId}`,
  });
  const expiredIds: number[] = [];
  let sent = 0;
  let failed = 0;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 60 * 60 * 12 });
      sent += 1;
    } catch (error) {
      if (isExpiredPushSubscription(error)) expiredIds.push(subscription.id);
      else {
        failed += 1;
        console.error(`[Web Push] Failed for user ${input.userId}, subscription ${subscription.id}`, error);
      }
    }
  }
  const expired = await db.removeWebPushSubscriptionsByIds(expiredIds);
  return { sent, expired, failed };
}
