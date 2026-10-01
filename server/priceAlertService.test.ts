import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listExtensionAlertObservationStatuses: vi.fn(),
  getProductById: vi.fn(),
  get24hLowestExtensionPrice: vi.fn(),
  listPriceAlertRecipients: vi.fn(),
  claimPriceAlertDelivery: vi.fn(),
  completePriceAlertDelivery: vi.fn(),
  failPriceAlertDelivery: vi.fn(),
  claimTargetPriceAlertDelivery: vi.fn(),
  completeTargetPriceAlertDelivery: vi.fn(),
  failTargetPriceAlertDelivery: vi.fn(),
  sendPriceAlertEmail: vi.fn(),
  sendTargetPricePushNotification: vi.fn(),
  buildPriceAlertUnsubscribeUrl: vi.fn(),
  getProductGroupSummary: vi.fn(),
}));

vi.mock("./db", () => ({
  listExtensionAlertObservationStatuses: mocks.listExtensionAlertObservationStatuses,
  getProductById: mocks.getProductById,
  get24hLowestExtensionPrice: mocks.get24hLowestExtensionPrice,
  listPriceAlertRecipients: mocks.listPriceAlertRecipients,
  claimPriceAlertDelivery: mocks.claimPriceAlertDelivery,
  completePriceAlertDelivery: mocks.completePriceAlertDelivery,
  failPriceAlertDelivery: mocks.failPriceAlertDelivery,
  claimTargetPriceAlertDelivery: mocks.claimTargetPriceAlertDelivery,
  completeTargetPriceAlertDelivery: mocks.completeTargetPriceAlertDelivery,
  failTargetPriceAlertDelivery: mocks.failTargetPriceAlertDelivery,
  getProductGroupSummary: mocks.getProductGroupSummary,
}));
vi.mock("./gmailSender", async importOriginal => {
  const actual = await importOriginal<typeof import("./gmailSender")>();
  return { ...actual, sendPriceAlertEmail: mocks.sendPriceAlertEmail };
});
vi.mock("./webPushSender", () => ({ sendTargetPricePushNotification: mocks.sendTargetPricePushNotification }));
vi.mock("./priceAlertUnsubscribe", () => ({ buildPriceAlertUnsubscribeUrl: mocks.buildPriceAlertUnsubscribeUrl }));

import { checkAndSendExtensionPriceAlerts, hasReachedTargetPrice, is24hLowestPrice } from "./priceAlertService";

const recipient = { userId: 7, email: "buyer@gmail.com", productId: 42, favoriteId: 81, favoriteCreatedAt: new Date("2026-08-17T01:00:00.000Z"), targetPrice: null, targetPriceVersion: 0 };
const observedAt = new Date("2026-08-25T23:55:00.000Z");

describe("확장 프로그램 와우 회원가 알림", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listExtensionAlertObservationStatuses.mockResolvedValue([{ productId: 42, price: 12_900, observedAt, isFresh: true }]);
    mocks.getProductById.mockResolvedValue({ id: 42, name: "테스트 커피", currentPrice: 15_900, affiliateUrl: "https://link.coupang.com/a/test", deepLinkUrl: "https://link.coupang.com/a/ready" });
    mocks.get24hLowestExtensionPrice.mockResolvedValue(12_900);
    mocks.listPriceAlertRecipients.mockResolvedValue([recipient]);
    mocks.claimPriceAlertDelivery.mockResolvedValue(101);
    mocks.sendPriceAlertEmail.mockResolvedValue({ messageId: "smtp-id" });
    mocks.sendTargetPricePushNotification.mockResolvedValue({ sent: 0, expired: 0, failed: 0 });
    mocks.buildPriceAlertUnsubscribeUrl.mockReturnValue("https://gasyn.example/unsubscribe");
    // 2026-10-01: 기본값은 "같은 제품을 파는 다른 판매자가 없음"이다. 아래 전용 테스트에서만
    // 더 싼 판매자를 돌려주도록 덮어쓴다.
    mocks.getProductGroupSummary.mockResolvedValue({ memberCount: 1, sellerCount: 1, lowestPrice: null, lowestProduct: null });
  });

  it("공식 API 현재가가 달라도 신선한 확장 프로그램 회원가만으로 최저가 알림을 보낸다", async () => {
    const result = await checkAndSendExtensionPriceAlerts([42]);
    expect(result).toMatchObject({ eligibleProducts: 1, sent: 1 });
    expect(mocks.claimPriceAlertDelivery).toHaveBeenCalledWith(expect.objectContaining({ currentPrice: 12_900, lowestPrice24h: 12_900 }));
    expect(mocks.sendPriceAlertEmail).toHaveBeenCalledWith(expect.objectContaining({ currentPrice: 12_900, checkedAt: observedAt }));
  });

  // 2026-10-01: 추적 단위를 제품(상품명 + 용량 + 수량)으로 올린 뒤, 알림을 받고 눌렀더니
  // 같은 제품이 다른 판매자 쪽에서 더 쌌다는 상황을 만들지 않는다.
  it("같은 제품을 더 싸게 파는 판매자가 있으면 그쪽 딥링크로 보낸다", async () => {
    mocks.getProductGroupSummary.mockResolvedValue({
      memberCount: 2,
      sellerCount: 2,
      lowestPrice: 11_900,
      lowestProduct: { id: 77, currentPrice: 11_900, deepLinkUrl: "https://link.coupang.com/a/cheaper" },
    });
    await expect(checkAndSendExtensionPriceAlerts([42])).resolves.toMatchObject({ sent: 1 });
    expect(mocks.sendPriceAlertEmail).toHaveBeenCalledWith(expect.objectContaining({ affiliateUrl: "https://link.coupang.com/a/cheaper" }));
  });

  it("더 싼 판매자에게 딥링크가 아직 없으면 원래 상품 링크를 그대로 쓴다", async () => {
    mocks.getProductGroupSummary.mockResolvedValue({
      memberCount: 2,
      sellerCount: 2,
      lowestPrice: 11_900,
      lowestProduct: { id: 77, currentPrice: 11_900, deepLinkUrl: null },
    });
    await expect(checkAndSendExtensionPriceAlerts([42])).resolves.toMatchObject({ sent: 1 });
    expect(mocks.sendPriceAlertEmail).toHaveBeenCalledWith(expect.objectContaining({ affiliateUrl: "https://link.coupang.com/a/ready" }));
  });

  it("그룹 최저가 조회가 실패해도 알림은 그대로 나간다", async () => {
    mocks.getProductGroupSummary.mockRejectedValue(new Error("db unavailable"));
    await expect(checkAndSendExtensionPriceAlerts([42])).resolves.toMatchObject({ sent: 1 });
    expect(mocks.sendPriceAlertEmail).toHaveBeenCalledWith(expect.objectContaining({ affiliateUrl: "https://link.coupang.com/a/ready" }));
  });

  it("7일을 넘긴 관측은 목표가를 만족해도 알림을 보내지 않는다", async () => {
    mocks.listExtensionAlertObservationStatuses.mockResolvedValue([{ productId: 42, price: 9_900, observedAt: new Date("2026-08-18T00:00:00.000Z"), isFresh: false }]);
    mocks.listPriceAlertRecipients.mockResolvedValue([{ ...recipient, targetPrice: 10_000, targetPriceVersion: 2 }]);
    await expect(checkAndSendExtensionPriceAlerts([42])).resolves.toMatchObject({ eligibleProducts: 0, sent: 0 });
    expect(mocks.claimTargetPriceAlertDelivery).not.toHaveBeenCalled();
    expect(mocks.sendPriceAlertEmail).not.toHaveBeenCalled();
  });

  it("신선한 회원가가 목표가 이하일 때만 목표가 알림을 보낸다", async () => {
    mocks.listPriceAlertRecipients.mockResolvedValue([{ ...recipient, targetPrice: 13_000, targetPriceVersion: 2 }]);
    mocks.claimTargetPriceAlertDelivery.mockResolvedValue(202);
    await expect(checkAndSendExtensionPriceAlerts([42])).resolves.toMatchObject({ eligibleProducts: 1, sent: 1 });
    expect(mocks.claimTargetPriceAlertDelivery).toHaveBeenCalledWith(expect.objectContaining({ currentPrice: 12_900, targetPrice: 13_000 }));
    expect(mocks.sendTargetPricePushNotification).toHaveBeenCalledWith(expect.objectContaining({ currentPrice: 12_900 }));
  });

  it("기본 가격 비교 함수는 같은 값 또는 더 낮은 값만 허용한다", () => {
    expect(is24hLowestPrice(12_900, 12_900)).toBe(true);
    expect(hasReachedTargetPrice(12_900, 13_000)).toBe(true);
  });

  // Railway Free/Trial/Hobby 플랜은 아웃바운드 SMTP를 차단해 Gmail 발송이
  // "ETIMEDOUT"/"CONN"으로 타임아웃될 수 있다. 이 실패가 알림 전체를 죽이지 않고
  // failPriceAlertDelivery에 원인이 바로 드러나는 메시지로 기록되어야 한다.
  it("Gmail SMTP가 타임아웃으로 실패해도 원인을 남기고 계속 진행한다", async () => {
    const timeoutError = Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT", command: "CONN" });
    mocks.sendPriceAlertEmail.mockRejectedValueOnce(timeoutError);

    const result = await checkAndSendExtensionPriceAlerts([42]);

    expect(result).toMatchObject({ eligibleProducts: 1, sent: 0, failed: 1 });
    expect(mocks.failPriceAlertDelivery).toHaveBeenCalledWith(101, expect.stringContaining("Railway"));
  });
});
