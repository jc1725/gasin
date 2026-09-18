import { timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { ENV } from "./_core/env";
import * as db from "./db";
import { checkAndSendExtensionPriceAlerts } from "./priceAlertService";
import { generatePendingDeepLinksForProductIds } from "./deepLinks";
import { logError, logInfo, logWarn } from "./_core/log";

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

/**
 * 스키마 검증 실패를 구조화 로그로 남긴다. 실제 상품명·가격 같은 스크래핑 값은
 * 신뢰할 수 없는 외부 입력이라 로그에 남기지 않고, 몇 개 중 몇 개가 왜(zod 경로) 실패했는지만 남긴다 —
 * 쿠팡 페이지 구조 변경으로 수집기 파싱이 깨졌을 때 이 로그만 보고도 원인 필드를 좁힐 수 있게 한다.
 */
function logWarnInvalidCollectPayload(request: Request, error: z.ZodError) {
  const rawItems = (request.body as { items?: unknown[] } | null)?.items;
  const itemCount = Array.isArray(rawItems) ? rawItems.length : null;
  const issuePaths = error.issues.slice(0, 20).map(issue => issue.path.join("."));
  logWarn("collect_payload_invalid", "collector_extension", { itemCount, issueCount: error.issues.length, issuePaths });
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
    const startedAt = Date.now();
    const parsed = collectBodySchema.safeParse(request.body);
    if (!parsed.success) {
      // 2026-09-18: 구조화 로그 적용 — 쿠팡 페이지 구조가 바뀌면 수집기가 스키마에 안
      // 맞는 값을 보내기 시작하는데, 예전엔 이 경로에 로그가 전혀 없어서 확장이 조용히
      // 계속 실패해도 서버 쪽에서 알아챌 방법이 없었다. itemCount·에러 경로만 남기고
      // 상품명 등 실제 페이로드 내용은 남기지 않는다(스크래핑 데이터는 신뢰 불가 외부
      // 입력이라 로그에 그대로 적재하지 않는다).
      logWarnInvalidCollectPayload(request, parsed.error);
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
          logError("collect_deep_link_generation_failed", "collector_extension", deepLinkError, { pendingDeepLinkCount: pendingDeepLinkProductIds.length });
          deepLinks = { processedCount: 0, detail: "수집 관측은 저장됐으며 딥링크 생성은 다음 안전한 실행에서 재시도합니다." };
        }
      }
      let alerts = { eligibleProducts: 0, recipientCandidates: 0, sent: 0, skippedDuplicate: 0, failed: 0, pushSent: 0, pushExpired: 0, pushFailed: 0 };
      try {
        alerts = await checkAndSendExtensionPriceAlerts(result.alertProductIds);
      } catch (alertError) {
        logError("collect_price_alert_evaluation_failed", "collector_extension", alertError, { alertProductCount: result.alertProductIds.length });
      }
      // 큐 정체·FK 오류처럼 "이 배치가 실제로 뭘 했는지"가 진단하기 어려웠던 과거
      // 버그들을 계기로, 배치당 결과 요약(생성/갱신/오래된 관측/딥링크/알림 건수)을
      // 한 줄 남긴다 — 어떤 상품이었는지는 남기지 않고(외부 데이터), 집계 수치만 남긴다.
      logInfo("collect_batch_success", "collector_extension", {
        itemCount: items.length,
        stored: result.stored,
        skipped: result.skipped,
        created: result.products.created,
        updated: result.products.updated,
        stale: result.products.stale,
        priceHistoryAdded: result.products.priceHistoryAdded,
        alertCount: result.alertProductIds.length,
        deepLinkProcessed: deepLinks.processedCount,
        durationMs: Date.now() - startedAt,
      });
      response.status(201).json({ ok: true, received: items.length, ...result, deepLinks, alerts });
    } catch (error) {
      logError("collect_batch_failed", "collector_extension", error, { itemCount: items.length, durationMs: Date.now() - startedAt });
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
