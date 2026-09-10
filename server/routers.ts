import { COOKIE_NAME, isAdminEmail } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getProductCandidateForUser,
  getPublicServiceStats,
  listHomeFeaturedProducts,
  updateProductCandidateForUser,
  deleteProductCandidateForUser,
  getProductById,
  listCollectedPriceHistory,
  getStoredHomeCoupangLink,
  importAdminConfirmedPrices,
  deleteDeferredProductForAdmin,
  enqueueAllSearchProductsForPriceRefresh,
  enqueueFavoritedProductsForPriceRefresh,
  markDeferredProductSoldOutForAdmin,
  exportAdminPriceHistory,
  listDeferredProductsForAdmin,
  listCurrentPriceProductsForAdmin,
  deleteTrackedProductForAdmin,
  deleteTrackedProductsForAdmin,
  markTrackedProductSoldOutForAdmin,
  listAllDeferredProductsForAdminSummary,
  listMissingOptionMetadataForAdmin,
  updateAdminOptionMetadataCsvRows,
  updateAdminProductOptionMetadata,
  listLatestAdminConfirmedPrices,
  saveAdminConfirmedPrice,
  getProductDetail,
  markProductViewed,
  createManualLinkTrack,
  listRelatedProductVariants,
  isFavorite,
  listFavoriteProducts,
  listManualLinkTracks,
  listProducts,
  getSearchApiQuotaStatus,
  listSearchSuggestions,
  listFavoriteTargetPrices,
  listFavoriteExtensionAlertObservationStatuses,
  getLatestSyncRun,
  getPriceRefreshStats24h,
  getPriceTrackingPerformanceMetrics,
  getExternalCronRecheckSummary,
  listFailedPriceRefreshRuns24h,
  recordSearchEvent,
  listMissingSearchesForAdmin,
  mergeDuplicateMissingSearchesForAdmin,
  deleteMissingSearchForAdmin,
  pruneResolvedMissingSearchesForAdmin,
  listSearchEventsForAdmin,
  addMissingSearchCandidate,
  getGoogleDriveConnectionForUser,
  listProductCandidates,
  listProductRequestsForAdmin,
  getProductRequestForAdmin,
  listLatestUserConfirmedPricesForFavorites,
  listLatestUserConfirmedPricesForOwnedProducts,
  listUserConfirmedPricesForProduct,
  setFavoriteTargetPrice,
  submitProductRequest,
  markCandidateSentToTracking,
  saveGoogleDriveCandidateCsvFile,
  saveGoogleDriveUserPriceCsvFile,
  startSyncRun,
  finishSyncRun,
  toggleFavorite,
  updateProductRequestStatusForAdmin,
  importUserConfirmedPrices,
  listWebPushSubscriptionsForUser,
  removeWebPushSubscription,
  listDuplicateProductCandidatesForAdmin,
  getDuplicateProductMergePreview,
  mergeDuplicateProductsForAdmin,
  upsertWebPushSubscription,
  upsertProductCandidates,
  createSmartstoreHotDeal,
  getUserById,
  listMembersForAdmin,
  listPublicSmartstoreHotDeals,
  listSmartstoreHotDealsForAdmin,
  removeSmartstoreHotDeal,
  updateUserRoleForAdmin,
  updateUserSuspensionForAdmin,
  updateSmartstoreHotDeal,
} from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { materializeSearchResult, searchCatalogSafely } from "./catalogSearch";
import { parseCoupangLink, resolveCoupangLink } from "./manualLink";
import { parseCandidateCsv } from "./candidateCsv";
import { parseUserConfirmedPriceCsv } from "./userConfirmedPriceCsv";
import { parseAdminOptionCsv } from "./adminOptionCsv";
import { buildAdminPriceHistoryCsv } from "./adminPriceExport";
import { loadCandidateCsvFromPersonalGoogleDrive, loadUserConfirmedPriceCsvFromPersonalGoogleDrive } from "./googleDrivePersonal";
import { systemRouter } from "./_core/systemRouter";
import { sdk } from "./_core/sdk";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getWebPushConfiguration } from "./webPushConfig";
import { syncCollectedPriceDataForAdmin, syncCollectorMetadataForAdmin, backfillMissingOptionMetadataFromNamesForAdmin } from "./collectorSyncService";
import { collectGoldBoxProducts } from "./scheduledJobs";
import { classifyDeferredPriceInputs } from "./deferredPriceInput";
import { refreshDeepLinkForExactSku } from "./deepLinkManualRefresh";

function requireGoogleUser(loginMethod: string | null) {
  if (loginMethod !== "google") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "찜한상품은 Google 로그인 후 이용할 수 있습니다.",
    });
  }
}

const smartstoreHotDealInput = z.object({
  title: z.string().trim().min(2).max(500),
  storeName: z.string().trim().min(1).max(160).default("스마트스토어"),
  description: z.string().trim().max(4_000).nullable().optional(),
  imageUrl: z.string().trim().url().max(2_000).nullable().optional(),
  purchaseUrl: z.string().trim().url().max(2_000),
  regularPrice: z.number().int().positive().nullable().optional(),
  salePrice: z.number().int().positive(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(-999).max(999).default(0),
  startsAt: z.string().trim().max(40).nullable().optional(),
  endsAt: z.string().trim().max(40).nullable().optional(),
});

function parseOptionalHotDealDate(value: string | null | undefined, label: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TRPCError({ code: "BAD_REQUEST", message: `${label}이 올바른 날짜가 아닙니다.` });
  return date;
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    suspensionStatus: publicProcedure.query(({ ctx }) => sdk.getSuspensionStatus(ctx.req)),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      // Express deprecated passing maxAge to clearCookie (it already expires the
      // cookie immediately on its own); omit it to silence the runtime warning.
      ctx.res.clearCookie(COOKIE_NAME, cookieOptions);
      return {
        success: true,
      } as const;
    }),
  }),
  members: router({
    list: adminProcedure.query(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return listMembersForAdmin();
    }),
    setRole: adminProcedure
      .input(z.object({ memberId: z.number().int().positive(), role: z.enum(["user", "admin"]) }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        if (!isAdminEmail(ctx.user.email)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "지정 관리자만 회원 권한을 변경할 수 있습니다." });
        }
        const member = await getUserById(input.memberId);
        if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "회원을 찾을 수 없습니다." });
        if (isAdminEmail(member.email)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "지정 관리자의 권한은 변경할 수 없습니다." });
        }
        if (input.role === "admin" && member.loginMethod !== "google") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "관리자 권한은 Google 로그인 회원에게만 지정할 수 있습니다." });
        }
        if (input.role === "admin" && member.isSuspended) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "이용정지를 해제한 뒤 관리자 권한을 지정할 수 있습니다." });
        }
        const result = await updateUserRoleForAdmin(member.id, input.role);
        if (!result.updated) throw new TRPCError({ code: "NOT_FOUND", message: "회원 권한을 변경하지 못했습니다." });
        return { success: true as const, memberId: member.id, role: input.role };
      }),
    setSuspension: adminProcedure
      .input(z.object({ memberId: z.number().int().positive(), isSuspended: z.boolean(), reason: z.string().trim().min(2).max(500).nullable().optional(), endsAt: z.string().datetime({ offset: true }).nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        if (!isAdminEmail(ctx.user.email)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "지정 관리자만 회원 이용정지를 변경할 수 있습니다." });
        }
        const member = await getUserById(input.memberId);
        if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "회원을 찾을 수 없습니다." });
        if (isAdminEmail(member.email)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "지정 관리자는 이용정지할 수 없습니다." });
        }
        if (member.role === "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "관리자 권한을 해제한 뒤 이용정지할 수 있습니다." });
        }
        if (input.isSuspended && !input.reason) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "이용정지 사유를 입력해 주세요." });
        }
        const endsAt = input.isSuspended && input.endsAt ? new Date(input.endsAt) : null;
        if (input.isSuspended && (!endsAt || Number.isNaN(endsAt.getTime()) || endsAt <= new Date())) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "미래의 해제 예정일을 입력해 주세요." });
        }
        const result = await updateUserSuspensionForAdmin(member.id, { isSuspended: input.isSuspended, reason: input.reason?.trim() || null, endsAt });
        if (!result.updated) throw new TRPCError({ code: "NOT_FOUND", message: "회원 이용정지 상태를 변경하지 못했습니다." });
        return { success: true as const, memberId: member.id, isSuspended: input.isSuspended };
      }),
  }),
  catalog: router({
    homeCoupangLink: publicProcedure.query(() => getStoredHomeCoupangLink()),
    homeFeatured: publicProcedure
      .input(z.object({ limit: z.number().int().min(1).max(50).optional() }).optional())
      .query(({ input }) => listHomeFeaturedProducts(input?.limit)),
    list: publicProcedure
      .input(z.object({ source: z.enum(["goldbox", "search", "bestcategory", "collection"]).optional(), limit: z.number().int().min(1).max(100).optional() }).optional())
      .query(({ input }) => listProducts(input)),
    product: publicProcedure
      .input(z.object({ productId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const detail = await getProductDetail(input.productId);
        if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "상품을 찾을 수 없습니다." });
        return detail;
      }),
    collectedPriceHistory: publicProcedure
      .input(z.object({ productId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const product = await getProductById(input.productId);
        if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "상품을 찾을 수 없습니다." });
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        return listCollectedPriceHistory(product.externalProductId, ninetyDaysAgo);
      }),
    markViewed: publicProcedure
      .input(z.object({ productId: z.number().int().positive() }))
      .mutation(({ input }) => markProductViewed(input.productId)),
    relatedVariants: publicProcedure
      .input(z.object({ productId: z.number().int().positive() }))
      .query(({ input }) => listRelatedProductVariants(input.productId)),
    search: publicProcedure
      .input(z.object({ keyword: z.string().trim().min(1).max(80), limit: z.number().int().min(1).max(10).optional(), refresh: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        // 방문자가 검색만 해도 상품이 통째로 영구 저장되어 가격 추적 목록이 무작위로
        // 계속 늘어나는 것을 막기 위해, 검색 자체는 더 이상 저장하지 않는다(persistNewResults: false).
        // 실제 추적은 사용자가 결과를 클릭해 열거나 찜할 때 materializeSearchResult에서 시작된다.
        const result = await searchCatalogSafely(input.keyword, input.limit, { forceExternal: input.refresh === true, persistNewResults: false });
        await recordSearchEvent({ userId: ctx.user?.id ?? null, keyword: input.keyword, resultSource: result.source, resultCount: result.products.length });
        return result;
      }),
    materializeSearchResult: publicProcedure
      .input(z.object({ keyword: z.string().trim().min(1).max(80), productId: z.number().int().positive(), productUrl: z.string().url() }))
      .mutation(async ({ input }) => {
        const saved = await materializeSearchResult(input.keyword, { productId: input.productId, productUrl: input.productUrl });
        if (!saved) throw new TRPCError({ code: "NOT_FOUND", message: "검색 결과가 만료되었습니다. 다시 검색해 주세요." });
        return saved;
      }),
    suggestions: publicProcedure
      .input(z.object({ query: z.string().trim().max(80), limit: z.number().int().min(1).max(8).optional() }))
      .query(({ input }) => listSearchSuggestions(input.query, input.limit)),
    searchStatus: publicProcedure.query(() => getSearchApiQuotaStatus()),
  }),
  siteStats: router({
    public: publicProcedure.query(() => getPublicServiceStats()),
  }),
  favorites: router({
    list: protectedProcedure.query(({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return listFavoriteProducts(ctx.user.id);
    }),
    state: protectedProcedure
      .input(z.object({ productId: z.number().int().positive() }))
      .query(({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        return isFavorite(ctx.user.id, input.productId);
      }),
    toggle: protectedProcedure
      .input(z.object({ productId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        const product = await getProductById(input.productId);
        if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "상품을 찾을 수 없습니다." });
        return toggleFavorite(ctx.user.id, input.productId);
      }),
    listTargetPrices: protectedProcedure.query(({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return listFavoriteTargetPrices(ctx.user.id);
    }),
    alertObservationStatus: protectedProcedure.query(({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return listFavoriteExtensionAlertObservationStatuses(ctx.user.id);
    }),
    setTargetPrice: protectedProcedure
      .input(z.object({ productId: z.number().int().positive(), targetPrice: z.number().int().positive().max(100_000_000).nullable() }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        return setFavoriteTargetPrice(ctx.user.id, input.productId, input.targetPrice);
      }),
  }),
  webPush: router({
    config: publicProcedure.query(() => ({ publicKey: getWebPushConfiguration().publicKey })),
    status: protectedProcedure.query(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return { subscribed: (await listWebPushSubscriptionsForUser(ctx.user.id)).length > 0 };
    }),
    subscribe: protectedProcedure
      .input(z.object({ endpoint: z.string().url().max(2_048), p256dh: z.string().min(1).max(255), auth: z.string().min(1).max(255) }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        return upsertWebPushSubscription(ctx.user.id, input);
      }),
    unsubscribe: protectedProcedure
      .input(z.object({ endpoint: z.string().url().max(2_048) }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        return { removed: await removeWebPushSubscription(ctx.user.id, input.endpoint) };
      }),
  }),
  productRequests: router({
    submit: publicProcedure
      .input(z.object({ keyword: z.string().trim().min(1).max(160) }))
      .mutation(({ input }) => submitProductRequest(input.keyword)),
    listForAdmin: adminProcedure.query(({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return listProductRequestsForAdmin();
    }),
    updateStatus: adminProcedure
      .input(z.object({ requestId: z.number().int().positive(), status: z.enum(["pending", "reviewing", "added", "dismissed"]) }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        if (input.status !== "added") return updateProductRequestStatusForAdmin(input.requestId, input.status);
        const request = await getProductRequestForAdmin(input.requestId);
        if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "상품 추가 요청을 찾을 수 없습니다." });
        const searchResult = await searchCatalogSafely(request.keyword, 10, { forceExternal: true, callType: "product-search" });
        if (searchResult.source === "rate_limited") {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: searchResult.message ?? "쿠팡 API 보호 모드입니다. 잠시 후 다시 시도해 주세요." });
        }
        if (searchResult.products.length === 0) {
          const reviewing = await updateProductRequestStatusForAdmin(input.requestId, "reviewing");
          return { ...reviewing, searched: true as const, resultCount: 0, searchSource: searchResult.source, message: searchResult.message };
        }
        const added = await updateProductRequestStatusForAdmin(input.requestId, "added");
        return { ...added, searched: true as const, resultCount: searchResult.products.length, searchSource: searchResult.source, message: searchResult.message };
      }),
  }),
  manualLinks: router({
    list: adminProcedure.query(({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return listManualLinkTracks(ctx.user.id);
    }),
    add: adminProcedure
      .input(z.object({
        url: z.string().trim().url().max(2000),
        queryKeyword: z.string().trim().max(500).nullable().optional(),
        optionLabel: z.string().trim().max(500).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        return createManualLinkTrack(ctx.user.id, await resolveCoupangLink(input.url), {
          queryKeyword: input.queryKeyword,
          optionLabel: input.optionLabel,
        });
      }),
  }),
  drive: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      const connection = await getGoogleDriveConnectionForUser(ctx.user.id);
      return { connected: Boolean(connection), updatedAt: connection?.updatedAt ?? null, candidateCsvReady: Boolean(connection?.candidateCsvFileId), userPriceCsvReady: Boolean(connection?.userPriceCsvFileId) };
    }),
  }),
  adminPrices: router({
    priceRefreshStats24h: adminProcedure.query(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return getPriceRefreshStats24h();
    }),
    priceTrackingPerformanceMetrics: adminProcedure
      .input(z.object({ days: z.number().int().min(1).max(30).optional() }).optional())
      .query(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        return getPriceTrackingPerformanceMetrics(input?.days);
      }),
    failedPriceRefreshRuns24h: adminProcedure.query(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return listFailedPriceRefreshRuns24h();
    }),
    deferredInputSummary: adminProcedure.query(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      const [products, cronRecheck] = await Promise.all([
        listAllDeferredProductsForAdminSummary(),
        getExternalCronRecheckSummary(),
      ]);
      const latest = await listLatestAdminConfirmedPrices(ctx.user.id, products.map(product => product.id));
      return { ...classifyDeferredPriceInputs(products, latest).summary, cronRecheck };
    }),
    listDuplicateCandidates: adminProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
      .query(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        return listDuplicateProductCandidatesForAdmin(input?.limit);
      }),
    duplicateMergePreview: adminProcedure
      .input(z.object({ sourceProductId: z.number().int().positive(), targetProductId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        try {
          return await getDuplicateProductMergePreview(input.sourceProductId, input.targetProductId);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "병합 미리보기를 준비하지 못했습니다." });
        }
      }),
    mergeDuplicates: adminProcedure
      .input(z.object({ sourceProductId: z.number().int().positive(), targetProductId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        try {
          return await mergeDuplicateProductsForAdmin(input.sourceProductId, input.targetProductId);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "상품 병합에 실패했습니다." });
        }
      }),
    goldBoxSyncStatus: adminProcedure.query(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return getLatestSyncRun("goldbox");
    }),
    refreshGoldBox: adminProcedure.mutation(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return collectGoldBoxProducts();
    }),
    refreshDeepLink: adminProcedure
      .input(z.object({ productId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        try {
          return await refreshDeepLinkForExactSku(input.productId);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "딥링크 갱신에 실패했습니다." });
        }
      }),
    enqueueAllSearchProductsForPriceRefresh: adminProcedure.mutation(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      const queuedCount = await enqueueAllSearchProductsForPriceRefresh();
      return {
        queuedCount,
        detail: `검색 등록 활성 상품 ${queuedCount}개를 가격 재확인 대기열에 넣었습니다. 내부 자체 예약마다 오래된 상품부터 최대 10개씩 처리합니다.`,
      };
    }),
    enqueueFavoritedProductsForPriceRefresh: adminProcedure.mutation(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      const result = await enqueueFavoritedProductsForPriceRefresh();
      return {
        ...result,
        detail: result.queuedCount > 0
          ? `찜한 상품 ${result.queuedCount}개를 수집기 가격 업데이트 대상으로 등록했습니다.${result.skippedCount > 0 ? ` 비활성·품절 상품 ${result.skippedCount}개는 제외했습니다.` : ""}`
          : result.favoriteCount > 0
            ? `찜한 상품 ${result.favoriteCount}개가 있지만 활성·재고 보유 수집 대상은 없습니다.`
            : "현재 찜한 상품이 없습니다.",
      };
    }),
    collectorSyncStatus: adminProcedure.query(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return getLatestSyncRun("collection");
    }),
    syncCollectedPrices: adminProcedure.mutation(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return syncCollectedPriceDataForAdmin();
    }),
    syncCollectorMetadata: adminProcedure.mutation(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return syncCollectorMetadataForAdmin();
    }),
    backfillMissingOptionMetadataFromNames: adminProcedure.mutation(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return backfillMissingOptionMetadataFromNamesForAdmin();
    }),
    listCurrentPriceProducts: adminProcedure.query(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return listCurrentPriceProductsForAdmin();
    }),
    deleteCurrentPriceProduct: adminProcedure
      .input(z.object({ productId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        const result = await deleteTrackedProductForAdmin(input.productId);
        if (!result.deleted) throw new TRPCError({ code: "NOT_FOUND", message: "삭제할 가격 추이 상품을 찾을 수 없습니다." });
        return { success: true };
      }),
    deleteCurrentPriceProducts: adminProcedure
      .input(z.object({ productIds: z.array(z.number().int().positive()).min(1).max(100) }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        return deleteTrackedProductsForAdmin(input.productIds);
      }),
    markCurrentPriceProductSoldOut: adminProcedure
      .input(z.object({ productId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        const result = await markTrackedProductSoldOutForAdmin(input.productId);
        if (!result.soldOut) throw new TRPCError({ code: "NOT_FOUND", message: "품절 처리할 가격 추이 상품을 찾을 수 없습니다." });
        return { success: true };
      }),
    listSearchEvents: adminProcedure
      .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
      .query(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        return listSearchEventsForAdmin(input?.limit);
      }),
    listMissingSearches: adminProcedure
      .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
      .query(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        return listMissingSearchesForAdmin(input?.limit);
      }),
    mergeDuplicateMissingSearches: adminProcedure.mutation(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return mergeDuplicateMissingSearchesForAdmin();
    }),
    pruneResolvedMissingSearches: adminProcedure.mutation(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return pruneResolvedMissingSearchesForAdmin();
    }),
    addMissingSearchCandidate: adminProcedure
      .input(z.object({ keyword: z.string().trim().min(1).max(160) }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        return addMissingSearchCandidate(ctx.user.id, input.keyword);
      }),
    deleteMissingSearch: adminProcedure
      .input(z.object({ missingSearchId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        const result = await deleteMissingSearchForAdmin(input.missingSearchId);
        if (!result.deleted) throw new TRPCError({ code: "NOT_FOUND", message: "삭제할 검색 실패 이력을 찾을 수 없습니다." });
        return { success: true };
      }),
    importOptionsCsv: adminProcedure
      .input(z.object({ csvText: z.string().min(1).max(250_000) }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        const rows = parseAdminOptionCsv(input.csvText);
        return updateAdminOptionMetadataCsvRows(rows);
      }),
    listMissingOptions: adminProcedure.query(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return listMissingOptionMetadataForAdmin();
    }),
    updateOptions: adminProcedure
      .input(z.object({ rows: z.array(z.object({ productId: z.number().int().positive(), variantLabel: z.string().trim().max(500).nullable(), unitLabel: z.string().trim().max(80).nullable(), quantity: z.number().int().min(1).max(100000).nullable() })).min(1).max(200) }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        const results = [];
        for (const row of input.rows) results.push(await updateAdminProductOptionMetadata(row.productId, row.variantLabel?.trim() || null, row.unitLabel?.trim() || null, row.quantity ?? null));
        return { updatedCount: results.filter(result => result.updated).length };
      }),
    listDeferred: adminProcedure
      .input(z.object({ imageMissingOnly: z.boolean().optional(), soldOutOnly: z.boolean().optional(), automaticOnly: z.boolean().optional(), unmatchedSkuOnly: z.boolean().optional(), awaitingCollectionOnly: z.boolean().optional(), manualOnly: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => {
      requireGoogleUser(ctx.user.loginMethod);
      const summaryProducts = input?.manualOnly ? await listAllDeferredProductsForAdminSummary() : null;
      const summaryLatest = summaryProducts ? await listLatestAdminConfirmedPrices(ctx.user.id, summaryProducts.map(product => product.id)) : [];
      const summaryClassification = summaryProducts ? classifyDeferredPriceInputs(summaryProducts, summaryLatest) : null;
      const products = await listDeferredProductsForAdmin(500, {
        imageMissingOnly: input?.imageMissingOnly === true,
        soldOutOnly: input?.soldOutOnly === true,
        awaitingCollectionOnly: input?.awaitingCollectionOnly === true,
        unmatchedSkuOnly: input?.unmatchedSkuOnly === true,
        productIds: summaryClassification ? Array.from(summaryClassification.manualProductIds) : undefined,
      });
      const latest = summaryLatest.length > 0 ? summaryLatest.filter(price => products.some(product => product.id === price.productId)) : await listLatestAdminConfirmedPrices(ctx.user.id, products.map(product => product.id));
      const latestByProductId = new Map(latest.map(price => [price.productId, price]));
      const enriched = products.map(product => ({
        ...product,
        confirmedPrice: latestByProductId.get(product.id) ?? null,
        lastRefreshAttemptAt: product.lastRefreshAttemptAt?.toISOString() ?? null,
        nextRefreshAt: product.nextRefreshAt?.toISOString()
          ?? (product.source === "search" && product.refreshState === "deferred" && product.lastSeenAt
            ? new Date(new Date(product.lastSeenAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
            : null),
        recheckQueuePosition: null as number | null,
        automaticQueueSize: 0,
      }));
      if (input?.soldOutOnly || input?.imageMissingOnly) return enriched;
      const classification = classifyDeferredPriceInputs(enriched, latest);
      const automaticQueue = enriched
        .filter(product => classification.automaticProductIds.has(product.id))
        .sort((left, right) => new Date(left.nextRefreshAt ?? left.lastSeenAt).getTime() - new Date(right.nextRefreshAt ?? right.lastSeenAt).getTime() || left.id - right.id);
      const automaticQueuePosition = new Map(automaticQueue.map((product, index) => [product.id, index + 1]));
      const withQueueStatus = enriched.map(product => ({
        ...product,
        recheckQueuePosition: automaticQueuePosition.get(product.id) ?? null,
        automaticQueueSize: automaticQueue.length,
      }));
      if (input?.awaitingCollectionOnly) return withQueueStatus;
      if (input?.unmatchedSkuOnly) return withQueueStatus.filter(product => product.lastRefreshReason?.includes("정확 SKU 미일치"));
      if (input?.automaticOnly) return withQueueStatus.filter(product => classification.automaticProductIds.has(product.id));
      return withQueueStatus.filter(product => classification.manualProductIds.has(product.id));
      }),
    removeDeferred: adminProcedure
      .input(z.object({ productId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        const result = await deleteDeferredProductForAdmin(input.productId);
        if (!result.deleted) throw new TRPCError({ code: "NOT_FOUND", message: "삭제할 보류 상품을 찾을 수 없습니다." });
        return { success: true };
      }),
    markSoldOut: adminProcedure
      .input(z.object({ productId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        const result = await markDeferredProductSoldOutForAdmin(input.productId);
        if (!result.soldOut) throw new TRPCError({ code: "NOT_FOUND", message: "품절 처리할 보류 상품을 찾을 수 없습니다." });
        return { success: true };
      }),
    setManual: adminProcedure
      .input(z.object({ productId: z.number().int().positive(), price: z.number().int().positive().max(100_000_000), checkedAt: z.string().datetime({ offset: true }), note: z.string().trim().max(4_000).nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        return saveAdminConfirmedPrice(ctx.user.id, input.productId, input.price, new Date(input.checkedAt), input.note?.trim() || null);
      }),
    importCsv: adminProcedure
      .input(z.object({ csvText: z.string().min(1).max(250_000) }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        const rows = parseUserConfirmedPriceCsv(input.csvText);
        return importAdminConfirmedPrices(ctx.user.id, rows);
      }),
    exportPriceHistory: adminProcedure.query(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      const rows = await exportAdminPriceHistory(ctx.user.id);
      return { filename: `gasyn-price-history-${new Date().toISOString().slice(0, 10)}.csv`, csvText: buildAdminPriceHistoryCsv(rows), rowCount: rows.length };
    }),
  }),
  userPrices: router({
    importCsv: protectedProcedure
      .input(z.object({ csvText: z.string().min(1).max(250_000) }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        const rows = parseUserConfirmedPriceCsv(input.csvText);
        return importUserConfirmedPrices(ctx.user.id, rows);
      }),
    syncDriveCsv: protectedProcedure.mutation(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      const connection = await getGoogleDriveConnectionForUser(ctx.user.id);
      if (!connection) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "개인 Google Drive를 먼저 연결해 주세요." });
      const runId = await startSyncRun("drive");
      try {
        const driveFile = await loadUserConfirmedPriceCsvFromPersonalGoogleDrive(connection);
        if (driveFile.fileId !== connection.userPriceCsvFileId) await saveGoogleDriveUserPriceCsvFile(ctx.user.id, driveFile.fileId);
        if (driveFile.action === "created") {
          await finishSyncRun(runId, "success", 0, "user price CSV template created; add rows in Google Drive before the next sync; Coupang API not called");
          return { importedCount: 0, duplicateCount: 0, unmatchedRows: [] as string[], action: driveFile.action };
        }
        const rows = parseUserConfirmedPriceCsv(driveFile.csvText, { allowEmpty: true });
        if (rows.length === 0) {
          await finishSyncRun(runId, "success", 0, "user price CSV loaded without price rows; Coupang API not called");
          return { importedCount: 0, duplicateCount: 0, unmatchedRows: [] as string[], action: driveFile.action, empty: true };
        }
        const result = await importUserConfirmedPrices(ctx.user.id, rows);
        await finishSyncRun(runId, "success", result.importedCount, `user price CSV ${driveFile.action}: ${result.importedCount} rows; Coupang API not called`);
        return { ...result, action: driveFile.action, empty: false };
      } catch (error) {
        await finishSyncRun(runId, "failed", 0, error instanceof Error ? error.message : "User price Drive CSV sync failed");
        throw error;
      }
    }),
    listForProduct: protectedProcedure
      .input(z.object({ productId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        return listUserConfirmedPricesForProduct(ctx.user.id, input.productId);
      }),
    listLatestForFavorites: protectedProcedure.query(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return listLatestUserConfirmedPricesForFavorites(ctx.user.id);
    }),
    listLatestForProducts: protectedProcedure
      .input(z.object({ productIds: z.array(z.number().int().positive()).max(50) }))
      .query(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        return listLatestUserConfirmedPricesForOwnedProducts(ctx.user.id, input.productIds);
      }),
  }),
  hotDeals: router({
    list: publicProcedure.query(() => listPublicSmartstoreHotDeals()),
    adminList: adminProcedure.query(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return listSmartstoreHotDealsForAdmin();
    }),
    create: adminProcedure.input(smartstoreHotDealInput).mutation(async ({ ctx, input }) => {
      requireGoogleUser(ctx.user.loginMethod);
      const startsAt = parseOptionalHotDealDate(input.startsAt, "시작 시각");
      const endsAt = parseOptionalHotDealDate(input.endsAt, "종료 시각");
      if (startsAt && endsAt && endsAt <= startsAt) throw new TRPCError({ code: "BAD_REQUEST", message: "종료 시각은 시작 시각보다 뒤여야 합니다." });
      if (input.regularPrice && input.regularPrice < input.salePrice) throw new TRPCError({ code: "BAD_REQUEST", message: "정상가는 특가보다 작을 수 없습니다." });
      return createSmartstoreHotDeal(ctx.user.id, { ...input, description: input.description || null, imageUrl: input.imageUrl || null, regularPrice: input.regularPrice || null, startsAt, endsAt });
    }),
    update: adminProcedure.input(z.object({ hotDealId: z.number().int().positive(), data: smartstoreHotDealInput })).mutation(async ({ ctx, input }) => {
      requireGoogleUser(ctx.user.loginMethod);
      const startsAt = parseOptionalHotDealDate(input.data.startsAt, "시작 시각");
      const endsAt = parseOptionalHotDealDate(input.data.endsAt, "종료 시각");
      if (startsAt && endsAt && endsAt <= startsAt) throw new TRPCError({ code: "BAD_REQUEST", message: "종료 시각은 시작 시각보다 뒤여야 합니다." });
      if (input.data.regularPrice && input.data.regularPrice < input.data.salePrice) throw new TRPCError({ code: "BAD_REQUEST", message: "정상가는 특가보다 작을 수 없습니다." });
      return updateSmartstoreHotDeal(input.hotDealId, { ...input.data, description: input.data.description || null, imageUrl: input.data.imageUrl || null, regularPrice: input.data.regularPrice || null, startsAt, endsAt });
    }),
    remove: adminProcedure.input(z.object({ hotDealId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return removeSmartstoreHotDeal(input.hotDealId);
    }),
  }),
  candidates: router({
    list: adminProcedure.query(({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      return listProductCandidates(ctx.user.id);
    }),
    importCsv: adminProcedure
      .input(z.object({ csvText: z.string().min(1).max(250_000) }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        const rows = parseCandidateCsv(input.csvText);
        const importedCount = await upsertProductCandidates(ctx.user.id, "csv_upload", rows);
        return { importedCount, totalRows: rows.length };
      }),
    syncDriveCsv: adminProcedure.mutation(async ({ ctx }) => {
      requireGoogleUser(ctx.user.loginMethod);
      const connection = await getGoogleDriveConnectionForUser(ctx.user.id);
      if (!connection) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "개인 Google Drive를 먼저 연결해 주세요." });
      const runId = await startSyncRun("drive");
      try {
        const driveFile = await loadCandidateCsvFromPersonalGoogleDrive(connection);
        if (driveFile.fileId !== connection.candidateCsvFileId) await saveGoogleDriveCandidateCsvFile(ctx.user.id, driveFile.fileId);
        if (driveFile.action === "created") {
          await finishSyncRun(runId, "success", 0, "candidate CSV template created; add rows in Google Drive before the next sync; Coupang API not called");
          return { importedCount: 0, totalRows: 0, action: driveFile.action };
        }
        const rows = parseCandidateCsv(driveFile.csvText);
        const importedCount = await upsertProductCandidates(ctx.user.id, "drive_csv", rows);
        await finishSyncRun(runId, "success", importedCount, `candidate CSV ${driveFile.action}: ${importedCount} rows; Coupang API not called`);
        return { importedCount, totalRows: rows.length, action: driveFile.action };
      } catch (error) {
        await finishSyncRun(runId, "failed", 0, error instanceof Error ? error.message : "Drive CSV sync failed");
        throw error;
      }
    }),
    update: adminProcedure
      .input(z.object({
        candidateId: z.number().int().positive(),
        name: z.string().trim().min(1).max(500),
        optionLabel: z.string().trim().max(500).nullable(),
        sourceUrl: z.string().trim().url().max(2_000).nullable(),
        notes: z.string().trim().max(4_000).nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        const candidate = await getProductCandidateForUser(ctx.user.id, input.candidateId);
        if (!candidate) throw new TRPCError({ code: "NOT_FOUND", message: "후보 상품을 찾을 수 없습니다." });
        await updateProductCandidateForUser(ctx.user.id, input.candidateId, {
          name: input.name,
          optionLabel: input.optionLabel || null,
          sourceUrl: input.sourceUrl || null,
          notes: input.notes || null,
        });
        return { success: true as const };
      }),
    remove: adminProcedure
      .input(z.object({ candidateId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        const candidate = await getProductCandidateForUser(ctx.user.id, input.candidateId);
        if (!candidate) throw new TRPCError({ code: "NOT_FOUND", message: "후보 상품을 찾을 수 없습니다." });
        await deleteProductCandidateForUser(ctx.user.id, input.candidateId);
        return { success: true as const };
      }),
    sendToTracking: adminProcedure
      .input(z.object({ candidateId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        requireGoogleUser(ctx.user.loginMethod);
        const candidate = await getProductCandidateForUser(ctx.user.id, input.candidateId);
        if (!candidate) throw new TRPCError({ code: "NOT_FOUND", message: "후보 상품을 찾을 수 없습니다." });
        if (!candidate.sourceUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "후보에 쿠팡 상품 URL이 없어 수동 추적에 보낼 수 없습니다." });
        const result = await createManualLinkTrack(ctx.user.id, parseCoupangLink(candidate.sourceUrl), {
          queryKeyword: candidate.name,
          optionLabel: candidate.optionLabel,
        });
        await markCandidateSentToTracking(ctx.user.id, candidate.id);
        return result;
      }),
  }),
});

export type AppRouter = typeof appRouter;
