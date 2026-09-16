import { timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { ENV } from "./_core/env";
import * as db from "./db";
import { checkAndSendExtensionPriceAlerts } from "./priceAlertService";
import { generatePendingDeepLinksForProductIds } from "./deepLinks";

const collectBodySchema = z.object({
  source: z.literal("gasyn-extension"),
  items: z.array(z.object({
    productId: z.string().trim().min(1).max(80),
    itemId: z.string().trim().regex(/^\d+$/).max(80).optional(),
    vendorItemId: z.string().trim().regex(/^\d+$/).max(80).optional(),
    name: z.string().trim().min(1).max(2_000),
    brand: z.string().trim().max(255).default(""),
    price: z.number().int().positive().max(2_000_000_000).optional(),
    inStock: z.boolean(),
    url: z.string().url().max(4_000),
    imageUrl: z.union([z.literal(""), z.string().url().max(4_000)]).optional(),
    optionName: z.string().trim().max(500).optional(),
    capacityText: z.string().trim().max(80).optional(),
    quantity: z.number().int().positive().max(1_000_000).optional(),
    pageType: z.string().trim().min(1).max(100),
    collectedAt: z.string().datetime({ offset: true }),
  }).strict()).min(1).max(100),
}).strict();

const goneReportBodySchema = z.object({
  source: z.literal("gasyn-extension"),
  productId: z.string().trim().regex(/^\d+$/).max(80),
  itemId: z.string().trim().regex(/^\d+$/).max(80).optional(),
  vendorItemId: z.string().trim().regex(/^\d+$/).max(80).optional(),
  url: z.string().url().max(4_000),
  message: z.string().trim().min(1).max(500),
  detectedAt: z.string().datetime({ offset: true }).optional(),
}).strict();

function applyCors(request: Request, response: Response) {
  const origin = request.header("origin") ?? "";
  response.setHeader("X-Gasyn-Collect-Schema-Version", "2");
  response.setHeader("Access-Control-Allow-Origin", origin.startsWith("chrome-extension://") ? origin : "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Vary", "Origin");
}

function hasValidBearerToken(request: Request) {
  const expected = ENV.gasynCollectToken;
  const header = request.header("authorization") ?? "";
  const provided = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

function collectionCorsMiddleware(request: Request, response: Response, next: () => void) {
  applyCors(request, response);
  if (request.method === "OPTIONS") {
    response.status(200).end();
    return;
  }
  next();
}

function authorize(request: Request, response: Response) {
  if (!ENV.gasynCollectToken) {
    response.status(503).json({ error: "Collection API token is not configured" });
    return false;
  }
  if (!hasValidBearerToken(request)) {
    response.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export function registerCollectionRoutes(app: Express) {
  // Keep CORS on the REST route registration itself; it is not environment- or build-config driven.
  app.use("/api/collect", collectionCorsMiddleware);
  app.use("/api/prices", collectionCorsMiddleware);

  app.post("/api/collect", async (request, response) => {
    if (!authorize(request, response)) return;
    const parsed = collectBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid collection payload", details: parsed.error.flatten() });
      return;
    }
    const items = parsed.data.items.map(item => ({ ...item, source: parsed.data.source, collectedAt: new Date(item.collectedAt) }));
    try {
      const result = await db.recordCollectedPriceItems(items);
      let deepLinks = { processedCount: 0, detail: "새 딥링크 생성 대상 없음" };
      const pendingDeepLinkProductIds = result.pendingDeepLinkProductIds ?? [];
      if (pendingDeepLinkProductIds.length > 0) {
        try {
          deepLinks = await generatePendingDeepLinksForProductIds(pendingDeepLinkProductIds);
        } catch (deepLinkError) {
          console.error("[Collect API] Failed to generate collector-verified deep links", deepLinkError);
          deepLinks = { processedCount: 0, detail: "수집 관측은 저장됐으며 딥링크 생성은 다음 안전한 실행에서 재시도합니다." };
        }
      }
      let alerts = { eligibleProducts: 0, recipientCandidates: 0, sent: 0, skippedDuplicate: 0, failed: 0, pushSent: 0, pushExpired: 0, pushFailed: 0 };
      try {
        alerts = await checkAndSendExtensionPriceAlerts(result.alertProductIds);
      } catch (alertError) {
        console.error("[Collect API] Failed to evaluate extension price alerts", alertError);
      }
      response.status(201).json({ ok: true, received: items.length, ...result, deepLinks, alerts });
    } catch (error) {
      console.error("[Collect API] Failed to persist collected prices", error);
      response.status(500).json({ error: "Failed to persist collected prices" });
    }
  });

  // 가신 수집기의 "백그라운드 자동 순회" 기능이 다음에 방문할 상품 후보를 요청하는
  // 엔드포인트. /api/collect와 같은 Bearer 토큰으로 인증한다. collection 소스뿐
  // 아니라 goldbox·bestcategory 소스도 포함한다 — db.getStaleTrackedProductsForExtensionRevisit
  // 주석 참고(2026-09-15: 이 두 소스가 refreshTrackedPrices 미연결로 사실상 방치돼
  // 있던 것을 확인해 포함시킴).
  app.get("/api/collect/candidates", async (request, response) => {
    if (!authorize(request, response)) return;
    const limitRaw = Number(request.query.limit);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
    const minStaleHoursRaw = Number(request.query.minStaleHours);
    const minStaleHours = Number.isFinite(minStaleHoursRaw) ? minStaleHoursRaw : 6;
    const clampedMinStaleHours = Math.min(Math.max(minStaleHours, 1), 24 * 7);
    try {
      const candidates = await db.getStaleTrackedProductsForExtensionRevisit(limit, clampedMinStaleHours * 60 * 60 * 1000);
      response.json({
        candidates: candidates.map(candidate => ({
          externalProductId: candidate.externalProductId,
          name: candidate.name,
          url: candidate.url,
          lastSeenAt: candidate.lastSeenAt,
        })),
      });
    } catch (error) {
      console.error("[Collect API] Failed to load auto-revisit candidates", error);
      response.status(500).json({ error: "Failed to load auto-revisit candidates" });
    }
  });

  // 가신 수집기가 방문한 상품 페이지가 "삭제/만료된 상품"으로 판단되면 보고받는
  // 엔드포인트. /api/collect와 같은 Bearer 토큰으로 인증한다. 2026-09-16: 사용자가
  // 실제 삭제 페이지에서 감지가 정확히 동작하는 것을 확인한 뒤 "확인되면 무조건
  // 삭제"로 정책을 바꿨다 — 감지된 문구 내용과 무관하게 보고되면 항상 완전
  // 삭제한다(db.deleteProductsReportedGoneByExtension 참고 — 가격 이력·즐겨찾기
  // 연결까지 함께 사라지며 되돌릴 수 없음).
  app.post("/api/collect/gone", async (request, response) => {
    if (!authorize(request, response)) return;
    const parsed = goneReportBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid gone-report payload", details: parsed.error.flatten() });
      return;
    }
    try {
      const result = await db.deleteProductsReportedGoneByExtension(parsed.data);
      if (result.deletedCount > 0) {
        console.log(`[Collect API] 삭제 상품 보고("${parsed.data.message.slice(0, 100)}")로 ${result.deletedCount}개 완전 삭제: ${result.deleted.map(item => item.externalProductId).join(", ")}`);
      }
      response.status(200).json({ ok: true, ...result });
    } catch (error) {
      console.error("[Collect API] Failed to delete gone product", error);
      response.status(500).json({ error: "Failed to delete gone product" });
    }
  });

  app.get("/api/prices/:productId", async (request, response) => {
    if (!authorize(request, response)) return;
    const productId = request.params.productId?.trim();
    const itemId = typeof request.query.itemId === "string" ? request.query.itemId.trim() : undefined;
    const vendorItemId = typeof request.query.vendorItemId === "string" ? request.query.vendorItemId.trim() : undefined;
    if (!productId || productId.length > 80 || (itemId && !/^\d+$/.test(itemId)) || (vendorItemId && !/^\d+$/.test(vendorItemId))) {
      response.status(400).json({ error: "Invalid productId" });
      return;
    }
    try {
      const skuKey = itemId && vendorItemId ? `${productId}:${itemId}:${vendorItemId}` : productId;
      const history = await db.listCollectedPriceHistory(skuKey);
      response.json({ productId, itemId: itemId ?? null, vendorItemId: vendorItemId ?? null, history });
    } catch (error) {
      console.error("[Collect API] Failed to load price history", error);
      response.status(500).json({ error: "Failed to load price history" });
    }
  });
}
