import * as db from "./db";
import { describeGmailSmtpError, sendPriceAlertEmail } from "./gmailSender";
import { buildPriceAlertUnsubscribeUrl } from "./priceAlertUnsubscribe";
import { sendTargetPricePushNotification } from "./webPushSender";

export function is24hLowestPrice(currentPrice: number, lowestPrice24h: number | null) {
  return Number.isInteger(currentPrice) && currentPrice > 0 && lowestPrice24h !== null && currentPrice <= lowestPrice24h;
}

export function hasReachedTargetPrice(currentPrice: number, targetPrice: number | null) {
  return Number.isInteger(currentPrice) && currentPrice > 0 && targetPrice !== null && Number.isInteger(targetPrice) && targetPrice > 0 && currentPrice <= targetPrice;
}

export type PriceAlertSendSummary = {
  eligibleProducts: number;
  recipientCandidates: number;
  sent: number;
  skippedDuplicate: number;
  failed: number;
  pushSent: number;
  pushExpired: number;
  pushFailed: number;
};

/**
 * 최저가·목표가 알림은 확장 프로그램이 관측한 신선한 와우 회원 적용가만 기준으로 합니다.
 * 쿠팡 파트너스 공식 API 기본가는 표시용 데이터이며 이 함수의 알림 기준에 절대 포함되지 않습니다.
 */
export async function checkAndSendExtensionPriceAlerts(productIds: number[], now = new Date()): Promise<PriceAlertSendSummary> {
  const summary: PriceAlertSendSummary = { eligibleProducts: 0, recipientCandidates: 0, sent: 0, skippedDuplicate: 0, failed: 0, pushSent: 0, pushExpired: 0, pushFailed: 0 };
  const observations = await db.listExtensionAlertObservationStatuses(productIds, now);

  for (const observation of observations) {
    if (!observation.isFresh || observation.price === null || observation.observedAt === null) continue;
    const product = await db.getProductById(observation.productId);
    if (!product) continue;

    const currentPrice = observation.price;
    const lowestPrice24h = await db.get24hLowestExtensionPrice(product.id, now);
    const recipients = await db.listPriceAlertRecipients(product.id);
    const isLowest24h = is24hLowestPrice(currentPrice, lowestPrice24h);
    let hasEligibleRecipient = false;

    for (const recipient of recipients) {
      // 목표가를 설정한 경우에는 목표가 도달 알림만 적용해 같은 관측에서 이중 메일을 보내지 않습니다.
      if (recipient.targetPrice !== null) {
        if (!hasReachedTargetPrice(currentPrice, recipient.targetPrice)) continue;
        hasEligibleRecipient = true;
        summary.recipientCandidates += 1;
        const alertLogId = await db.claimTargetPriceAlertDelivery({
          userId: recipient.userId,
          productId: product.id,
          favoriteId: recipient.favoriteId,
          targetPriceVersion: recipient.targetPriceVersion,
          targetPrice: recipient.targetPrice,
          currentPrice,
        });
        if (!alertLogId) {
          summary.skippedDuplicate += 1;
          continue;
        }
        try {
          await sendPriceAlertEmail({
            to: recipient.email,
            productName: product.name,
            currentPrice,
            lowestPrice24h: lowestPrice24h ?? currentPrice,
            checkedAt: observation.observedAt,
            affiliateUrl: product.deepLinkUrl ?? product.affiliateUrl,
            unsubscribeUrl: buildPriceAlertUnsubscribeUrl(recipient),
            alertKind: "target_price",
            targetPrice: recipient.targetPrice,
          });
          await db.completeTargetPriceAlertDelivery(alertLogId);
          summary.sent += 1;
        } catch (error) {
          const detail = describeGmailSmtpError(error);
          await db.failTargetPriceAlertDelivery(alertLogId, detail);
          summary.failed += 1;
          console.error(`[Target price alert] Gmail delivery failed for product ${product.id}, favorite ${recipient.favoriteId}`, error);
        }
        try {
          const pushSummary = await sendTargetPricePushNotification({ userId: recipient.userId, productId: product.id, productName: product.name, currentPrice, targetPrice: recipient.targetPrice });
          summary.pushSent += pushSummary.sent;
          summary.pushExpired += pushSummary.expired;
          summary.pushFailed += pushSummary.failed;
        } catch (error) {
          summary.pushFailed += 1;
          console.error(`[Target price alert] Web Push delivery failed for product ${product.id}, favorite ${recipient.favoriteId}`, error);
        }
        continue;
      }

      if (!isLowest24h || lowestPrice24h === null) continue;
      hasEligibleRecipient = true;
      summary.recipientCandidates += 1;
      const alertLogId = await db.claimPriceAlertDelivery({
        userId: recipient.userId,
        productId: product.id,
        favoriteId: recipient.favoriteId,
        favoriteCreatedAt: recipient.favoriteCreatedAt,
        currentPrice,
        lowestPrice24h,
      });
      if (!alertLogId) {
        summary.skippedDuplicate += 1;
        continue;
      }
      try {
        await sendPriceAlertEmail({
          to: recipient.email,
          productName: product.name,
          currentPrice,
          lowestPrice24h,
          checkedAt: observation.observedAt,
          affiliateUrl: product.deepLinkUrl ?? product.affiliateUrl,
          unsubscribeUrl: buildPriceAlertUnsubscribeUrl(recipient),
        });
        await db.completePriceAlertDelivery(alertLogId);
        summary.sent += 1;
      } catch (error) {
        const detail = describeGmailSmtpError(error);
        await db.failPriceAlertDelivery(alertLogId, detail);
        summary.failed += 1;
        console.error(`[Price alert] Gmail delivery failed for product ${product.id}, favorite ${recipient.favoriteId}`, error);
      }
    }
    if (hasEligibleRecipient) summary.eligibleProducts += 1;
  }
  return summary;
}
