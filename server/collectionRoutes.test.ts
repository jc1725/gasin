import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordCollectedPriceItems: vi.fn(),
  listCollectedPriceHistory: vi.fn(),
  checkAndSendExtensionPriceAlerts: vi.fn(),
  generatePendingDeepLinksForProductIds: vi.fn(),
}));

vi.mock("./db", () => ({
  recordCollectedPriceItems: mocks.recordCollectedPriceItems,
  listCollectedPriceHistory: mocks.listCollectedPriceHistory,
}));
vi.mock("./priceAlertService", () => ({ checkAndSendExtensionPriceAlerts: mocks.checkAndSendExtensionPriceAlerts }));
vi.mock("./deepLinks", () => ({ generatePendingDeepLinksForProductIds: mocks.generatePendingDeepLinksForProductIds }));

import { registerCollectionRoutes } from "./collectionRoutes";

let server: Server;
let baseUrl = "";
const token = process.env.GASYN_COLLECT_TOKEN ?? "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerCollectionRoutes(app);
  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      const address = server.address();
      if (address && typeof address !== "string") baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => new Promise<void>(resolve => server.close(() => resolve())));

describe("collection REST API", () => {
  it("uses the configured collection token to accept an extension payload", async () => {
    expect(token).not.toBe("");
    mocks.recordCollectedPriceItems.mockResolvedValue({ stored: 1, skipped: 0, alertProductIds: [17], pendingDeepLinkProductIds: [17], products: { created: 1, updated: 0, stale: 0, priceHistoryAdded: 1 } });
    mocks.generatePendingDeepLinksForProductIds.mockResolvedValue({ processedCount: 1, detail: "정확 SKU 딥링크 생성 완료" });
    mocks.checkAndSendExtensionPriceAlerts.mockResolvedValue({ sent: 0 });
    const response = await fetch(`${baseUrl}/api/collect`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Origin: "chrome-extension://gasyn" },
      body: JSON.stringify({ source: "gasyn-extension", items: [{ productId: "7144144379", itemId: "1057466829", vendorItemId: "5531594514", name: "테스트 샴푸", brand: "가신", price: 13000, inStock: true, url: "https://www.coupang.com/vp/products/7144144379?itemId=1057466829&vendorItemId=5531594514", imageUrl: "https://image.example.test/shampoo.jpg", optionName: "500ml × 2개", capacityText: "500ml", quantity: 2, pageType: "PRODUCT", collectedAt: "2026-08-18T06:00:00.000Z" }] }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("x-gasyn-collect-schema-version")).toBe("2");
    expect(response.headers.get("access-control-allow-origin")).toBe("chrome-extension://gasyn");
    expect(response.headers.get("access-control-allow-headers")).toBe("Content-Type, Authorization");
    expect(mocks.recordCollectedPriceItems).toHaveBeenCalledWith([expect.objectContaining({ productId: "7144144379", itemId: "1057466829", vendorItemId: "5531594514", imageUrl: "https://image.example.test/shampoo.jpg", optionName: "500ml × 2개", capacityText: "500ml", quantity: 2, inStock: true, source: "gasyn-extension", collectedAt: new Date("2026-08-18T06:00:00.000Z") })]);
    expect(mocks.checkAndSendExtensionPriceAlerts).toHaveBeenCalledWith([17]);
    expect(mocks.generatePendingDeepLinksForProductIds).toHaveBeenCalledWith([17]);
  });

  it("accepts an empty imageUrl so an existing product image can be preserved by the storage layer", async () => {
    mocks.recordCollectedPriceItems.mockResolvedValue({ stored: 0, skipped: 1, products: { created: 0, updated: 1, stale: 0, priceHistoryAdded: 0 } });
    const response = await fetch(`${baseUrl}/api/collect`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ source: "gasyn-extension", items: [{ productId: "7144144379", name: "테스트 샴푸", brand: "가신", price: 13000, inStock: true, url: "https://www.coupang.com/vp/products/7144144379", imageUrl: "", pageType: "PRODUCT", collectedAt: "2026-08-18T06:00:00.000Z" }] }),
    });
    expect(response.status).toBe(201);
    expect(mocks.recordCollectedPriceItems).toHaveBeenLastCalledWith([expect.objectContaining({ imageUrl: "" })]);
  });

  it("accepts a two-stage option name while preserving its purchase quantity", async () => {
    mocks.recordCollectedPriceItems.mockResolvedValue({ stored: 1, skipped: 0, alertProductIds: [], products: { created: 0, updated: 1, stale: 0, priceHistoryAdded: 0 } });
    const response = await fetch(`${baseUrl}/api/collect`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ source: "gasyn-extension", items: [{ productId: "12345", name: "메디힐 마스크팩", price: 10000, inStock: true, url: "https://www.coupang.com/vp/products/12345", optionName: "30개입, 2개", quantity: 2, pageType: "PRODUCT", collectedAt: "2026-08-27T01:00:00.000Z" }] }),
    });
    expect(response.status).toBe(201);
    expect(mocks.recordCollectedPriceItems).toHaveBeenLastCalledWith([expect.objectContaining({ optionName: "30개입, 2개", quantity: 2 })]);
  });

  it("accepts a price-less out-of-stock observation and responds to Chrome extension OPTIONS preflight", async () => {
    mocks.recordCollectedPriceItems.mockResolvedValue({ stored: 1, skipped: 0, products: { created: 0, updated: 1, stale: 0, priceHistoryAdded: 0 } });
    const preflight = await fetch(`${baseUrl}/api/collect`, { method: "OPTIONS", headers: { Origin: "chrome-extension://gasyn", "Access-Control-Request-Headers": "content-type,authorization" } });
    expect(preflight.status).toBe(200);
    expect(preflight.headers.get("x-gasyn-collect-schema-version")).toBe("2");
    expect(preflight.headers.get("access-control-allow-origin")).toBe("chrome-extension://gasyn");
    const response = await fetch(`${baseUrl}/api/collect`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Origin: "chrome-extension://gasyn" },
      body: JSON.stringify({ source: "gasyn-extension", items: [{ productId: "10000011473482", name: "대구 워터파크", inStock: false, url: "https://www.coupang.com/vp/products/10000011473482", pageType: "PRODUCT", collectedAt: "2026-08-25T00:00:00.000Z" }] }),
    });
    expect(response.status).toBe(201);
    expect(mocks.recordCollectedPriceItems).toHaveBeenLastCalledWith([expect.objectContaining({ productId: "10000011473482", inStock: false })]);
  });

  it("rejects missing tokens and returns histories in chronological order through the authenticated endpoint", async () => {
    await expect(fetch(`${baseUrl}/api/collect`, { method: "POST" }).then(response => response.status)).resolves.toBe(401);
    const history = [{ productId: "7144144379:1057466829:5531594514", itemId: "1057466829", vendorItemId: "5531594514", name: "테스트 샴푸", brand: "가신", price: 13000, url: "https://www.coupang.com/vp/products/7144144379", pageType: "PRODUCT", collectedAt: new Date("2026-08-18T06:00:00.000Z") }];
    mocks.listCollectedPriceHistory.mockResolvedValue(history);
    const response = await fetch(`${baseUrl}/api/prices/7144144379?itemId=1057466829&vendorItemId=5531594514`, { headers: { Authorization: `Bearer ${token}` } });
    await expect(response.json()).resolves.toEqual({
      productId: "7144144379",
      itemId: "1057466829",
      vendorItemId: "5531594514",
      history: [{ ...history[0], collectedAt: "2026-08-18T06:00:00.000Z" }],
    });
  });
});
