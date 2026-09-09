import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 128 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  isSuspended: boolean("isSuspended").default(false).notNull(),
  suspendedAt: timestamp("suspendedAt"),
  suspensionEndsAt: timestamp("suspensionEndsAt"),
  suspensionReason: varchar("suspensionReason", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const products = mysqlTable(
  "products",
  {
    id: int("id").autoincrement().primaryKey(),
    externalProductId: varchar("externalProductId", { length: 80 }).notNull(),
    name: text("name").notNull(),
    imageUrl: text("imageUrl").notNull(),
    affiliateUrl: text("affiliateUrl").notNull(),
    categoryName: varchar("categoryName", { length: 255 }),
    familyKey: varchar("familyKey", { length: 500 }),
    variantLabel: varchar("variantLabel", { length: 500 }),
    unitPrice: int("unitPrice"),
    unitLabel: varchar("unitLabel", { length: 80 }),
    quantity: int("quantity"),
    packSize: varchar("packSize", { length: 80 }),
    optionMetadataSource: mysqlEnum("optionMetadataSource", ["manual", "collection"]).default("manual").notNull(),
    trackingPriority: mysqlEnum("trackingPriority", ["low", "normal", "high"]).default("normal").notNull(),
    deepLinkUrl: text("deepLinkUrl"),
    deepLinkStatus: mysqlEnum("deepLinkStatus", ["pending", "ready", "failed"]).default("pending").notNull(),
    deepLinkFailureReason: text("deepLinkFailureReason"),
    deepLinkUpdatedAt: timestamp("deepLinkUpdatedAt"),
    lastViewedAt: timestamp("lastViewedAt"),
    refreshState: mysqlEnum("refreshState", ["fresh", "deferred", "awaiting_collection", "not_in_goldbox"]).default("fresh").notNull(),
    lastRefreshReason: text("lastRefreshReason"),
    lastRefreshAttemptAt: timestamp("lastRefreshAttemptAt"),
    nextRefreshAt: timestamp("nextRefreshAt"),
    currentPrice: int("currentPrice").notNull(),
    wowMemberPrice: int("wowMemberPrice"),
    wowMemberPriceObservedAt: timestamp("wowMemberPriceObservedAt"),
    lowestPrice: int("lowestPrice").notNull(),
    inStock: boolean("inStock").default(true).notNull(),
    source: mysqlEnum("source", ["goldbox", "search", "bestcategory", "collection"]).notNull(),
    isRocket: boolean("isRocket").default(false).notNull(),
    isFreeShipping: boolean("isFreeShipping").default(false).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("products_externalProductId_unique").on(table.externalProductId),
    index("products_source_lastSeenAt_idx").on(table.source, table.lastSeenAt),
    index("products_search_refresh_queue_idx").on(table.source, table.refreshState, table.nextRefreshAt),
    index("products_familyKey_idx").on(table.familyKey),
    index("products_trackingPriority_lastSeenAt_idx").on(table.trackingPriority, table.lastSeenAt),
    index("products_deepLinkStatus_lastSeenAt_idx").on(table.deepLinkStatus, table.lastSeenAt),
    index("products_trackingPriority_lastViewedAt_idx").on(table.trackingPriority, table.lastViewedAt),
  ]
);

export const priceHistory = mysqlTable(
  "priceHistory",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    price: int("price").notNull(),
    recordedAt: timestamp("recordedAt").defaultNow().notNull(),
  },
  table => [index("priceHistory_product_recorded_idx").on(table.productId, table.recordedAt)]
);

/** Chrome 확장 프로그램 등 외부 수집기가 기록한 원본 가격 관측값입니다. */
export const collectedPriceHistory = mysqlTable(
  "collectedPriceHistory",
  {
    id: int("id").autoincrement().primaryKey(),
    externalProductId: varchar("externalProductId", { length: 80 }).notNull(),
    itemId: varchar("itemId", { length: 80 }),
    vendorItemId: varchar("vendorItemId", { length: 80 }),
    name: text("name").notNull(),
    brand: varchar("brand", { length: 255 }).notNull(),
    price: int("price"),
    url: text("url").notNull(),
    imageUrl: text("imageUrl"),
    optionName: varchar("optionName", { length: 500 }),
    capacityText: varchar("capacityText", { length: 80 }),
    quantity: int("quantity"),
    packSize: varchar("packSize", { length: 80 }),
    inStock: boolean("inStock").default(true).notNull(),
    pageType: varchar("pageType", { length: 100 }).notNull(),
    source: varchar("source", { length: 64 }).notNull(),
    collectedAt: timestamp("collectedAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("collectedPriceHistory_product_collected_idx").on(table.externalProductId, table.collectedAt),
    index("collectedPriceHistory_vendor_collected_idx").on(table.vendorItemId, table.collectedAt),
  ]
);

export const categoryBestProducts = mysqlTable(
  "categoryBestProducts",
  {
    id: int("id").autoincrement().primaryKey(),
    categoryId: int("categoryId").notNull(),
    productId: int("productId")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    position: int("position").notNull(),
    collectedAt: timestamp("collectedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("categoryBestProducts_category_product_unique").on(table.categoryId, table.productId),
    index("categoryBestProducts_category_position_idx").on(table.categoryId, table.position),
    index("categoryBestProducts_product_idx").on(table.productId),
  ]
);

export const userConfirmedPrices = mysqlTable(
  "userConfirmedPrices",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: int("productId")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    price: int("price").notNull(),
    checkedAt: timestamp("checkedAt").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    note: text("note"),
    importKey: varchar("importKey", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("userConfirmedPrices_user_importKey_unique").on(table.userId, table.importKey),
    index("userConfirmedPrices_user_product_checked_idx").on(table.userId, table.productId, table.checkedAt),
  ]
);

export const favorites = mysqlTable(
  "favorites",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: int("productId")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    targetPrice: int("targetPrice"),
    targetPriceVersion: int("targetPriceVersion").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("favorites_user_product_unique").on(table.userId, table.productId),
    index("favorites_user_created_idx").on(table.userId, table.createdAt),
  ]
);

export const priceAlertLogs = mysqlTable(
  "priceAlertLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: int("productId")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    // The favorite row can be deleted when a user opts out, so this is intentionally
    // retained as a period identifier instead of a cascading foreign key.
    favoriteId: int("favoriteId").notNull(),
    favoriteCreatedAt: timestamp("favoriteCreatedAt").notNull(),
    currentPrice: int("currentPrice").notNull(),
    lowestPrice24h: int("lowestPrice24h").notNull(),
    deliveryStatus: mysqlEnum("deliveryStatus", ["reserved", "sent", "failed"]).default("reserved").notNull(),
    attemptedAt: timestamp("attemptedAt").defaultNow().notNull(),
    sentAt: timestamp("sentAt"),
    failureReason: text("failureReason"),
  },
  table => [
    uniqueIndex("priceAlertLogs_favorite_period_unique").on(table.favoriteId),
    index("priceAlertLogs_product_attempted_idx").on(table.productId, table.attemptedAt),
    index("priceAlertLogs_user_attempted_idx").on(table.userId, table.attemptedAt),
  ]
);

/** 찜한 상품의 사용자별 목표가 도달 알림 이력입니다. 목표가를 바꾸면 버전이 올라 다시 알림을 받을 수 있습니다. */
export const targetPriceAlertLogs = mysqlTable(
  "targetPriceAlertLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: int("productId")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    favoriteId: int("favoriteId").notNull(),
    targetPriceVersion: int("targetPriceVersion").notNull(),
    targetPrice: int("targetPrice").notNull(),
    currentPrice: int("currentPrice").notNull(),
    deliveryStatus: mysqlEnum("deliveryStatus", ["reserved", "sent", "failed"]).default("reserved").notNull(),
    attemptedAt: timestamp("attemptedAt").defaultNow().notNull(),
    sentAt: timestamp("sentAt"),
    failureReason: text("failureReason"),
  },
  table => [
    uniqueIndex("targetPriceAlertLogs_favorite_version_unique").on(table.favoriteId, table.targetPriceVersion),
    index("targetPriceAlertLogs_product_attempted_idx").on(table.productId, table.attemptedAt),
    index("targetPriceAlertLogs_user_attempted_idx").on(table.userId, table.attemptedAt),
  ]
);

/** 설치된 기기의 브라우저 푸시 구독입니다. 엔드포인트 해시로 같은 기기를 한 번만 보관합니다. */
export const webPushSubscriptions = mysqlTable(
  "webPushSubscriptions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpointHash: varchar("endpointHash", { length: 64 }).notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: varchar("p256dh", { length: 255 }).notNull(),
    auth: varchar("auth", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("webPushSubscriptions_endpointHash_unique").on(table.endpointHash),
    index("webPushSubscriptions_user_updated_idx").on(table.userId, table.updatedAt),
  ]
);

export const syncRuns = mysqlTable(
  "syncRuns",
  {
    id: int("id").autoincrement().primaryKey(),
    jobType: mysqlEnum("jobType", ["goldbox", "bestcategory", "price", "retention", "drive", "search", "deeplink", "collection", "lighthouse"])
      .notNull(),
    status: mysqlEnum("status", ["running", "success", "failed"])
      .notNull()
      .default("running"),
    processedCount: int("processedCount").default(0).notNull(),
    detail: text("detail"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    finishedAt: timestamp("finishedAt"),
  },
  table => [index("syncRuns_job_started_idx").on(table.jobType, table.startedAt)]
);

export const priceTrackingMetrics = mysqlTable(
  "priceTrackingMetrics",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").references(() => products.id, { onDelete: "cascade" }),
    runId: int("runId").references(() => syncRuns.id, { onDelete: "set null" }),
    source: varchar("source", { length: 32 }).notNull(),
    outcome: mysqlEnum("outcome", ["matched", "unmatched", "collector_resolved", "api_error", "rate_limited"]).notNull(),
    apiCalls: int("apiCalls").default(0).notNull(),
    durationMs: int("durationMs").default(0).notNull(),
    occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  },
  table => [
    index("priceTrackingMetrics_occurred_idx").on(table.occurredAt),
    index("priceTrackingMetrics_product_occurred_idx").on(table.productId, table.occurredAt),
    index("priceTrackingMetrics_outcome_occurred_idx").on(table.outcome, table.occurredAt),
  ],
);

export const scheduleSettings = mysqlTable("scheduleSettings", {
    id: int("id").autoincrement().primaryKey(),
    jobKey: mysqlEnum("jobKey", ["goldbox", "bestcategory", "price", "retention", "lighthouse"])
.notNull(),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    lastCompletedAt: timestamp("lastCompletedAt"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("scheduleSettings_jobKey_unique").on(table.jobKey),
    index("scheduleSettings_task_uid_idx").on(table.scheduleCronTaskUid),
  ]
);

export const searchCaches = mysqlTable(
  "searchCaches",
  {
    id: int("id").autoincrement().primaryKey(),
    normalizedKeyword: varchar("normalizedKeyword", { length: 160 }).notNull(),
    productIdsJson: text("productIdsJson").notNull(),
    fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    lastServedAt: timestamp("lastServedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("searchCaches_keyword_unique").on(table.normalizedKeyword),
    index("searchCaches_expiresAt_idx").on(table.expiresAt),
  ]
);

export const missingSearches = mysqlTable(
  "missingSearches",
  {
    id: int("id").autoincrement().primaryKey(),
    keyword: varchar("keyword", { length: 160 }).notNull(),
    normalizedKeyword: varchar("normalizedKeyword", { length: 160 }).notNull(),
    searchCount: int("searchCount").default(1).notNull(),
    firstSearchedAt: timestamp("firstSearchedAt").defaultNow().notNull(),
    lastSearchedAt: timestamp("lastSearchedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("missingSearches_keyword_unique").on(table.normalizedKeyword),
    index("missingSearches_lastSearchedAt_idx").on(table.lastSearchedAt),
  ]
);

/** 검색에서 찾지 못한 상품의 추가 요청입니다. 사용자 식별 정보 없이 검색어와 처리 상태만 집계합니다. */
export const productRequests = mysqlTable(
  "productRequests",
  {
    id: int("id").autoincrement().primaryKey(),
    keyword: varchar("keyword", { length: 160 }).notNull(),
    normalizedKeyword: varchar("normalizedKeyword", { length: 160 }).notNull(),
    requestCount: int("requestCount").default(1).notNull(),
    status: mysqlEnum("status", ["pending", "reviewing", "added", "dismissed"]).default("pending").notNull(),
    firstRequestedAt: timestamp("firstRequestedAt").defaultNow().notNull(),
    lastRequestedAt: timestamp("lastRequestedAt").defaultNow().notNull(),
    reviewedAt: timestamp("reviewedAt"),
  },
  table => [
    uniqueIndex("productRequests_keyword_unique").on(table.normalizedKeyword),
    index("productRequests_status_lastRequestedAt_idx").on(table.status, table.lastRequestedAt),
  ]
);

/** 관리자 검색 품질 개선용 전체 검색 기록입니다. 사용자 이메일·IP는 저장하지 않습니다. */
export const searchEvents = mysqlTable(
  "searchEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").references(() => users.id, { onDelete: "set null" }),
    keyword: varchar("keyword", { length: 160 }).notNull(),
    resultSource: varchar("resultSource", { length: 32 }).notNull(),
    resultCount: int("resultCount").notNull(),
    searchedAt: timestamp("searchedAt").defaultNow().notNull(),
  },
  table => [index("searchEvents_searchedAt_idx").on(table.searchedAt), index("searchEvents_user_searchedAt_idx").on(table.userId, table.searchedAt)]
);

export const searchApiQuotas = mysqlTable("searchApiQuotas", {
  scope: varchar("scope", { length: 32 }).primaryKey(),
  windowStartedAt: timestamp("windowStartedAt").notNull(),
  callCount: int("callCount").default(0).notNull(),
  lastCallAt: timestamp("lastCallAt"),
  blockedUntil: timestamp("blockedUntil"),
  lastError: text("lastError"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const manualLinkTracks = mysqlTable(
  "manualLinkTracks",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    linkKey: varchar("linkKey", { length: 80 }).notNull(),
    submittedUrl: text("submittedUrl").notNull(),
    externalProductId: varchar("externalProductId", { length: 80 }).notNull(),
    queryKeyword: varchar("queryKeyword", { length: 500 }),
    optionLabel: varchar("optionLabel", { length: 500 }),
    productId: int("productId").references(() => products.id, { onDelete: "set null" }),
    status: mysqlEnum("status", ["waiting", "active", "rejected"]).default("waiting").notNull(),
    lastError: text("lastError"),
    nextRetryAt: timestamp("nextRetryAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("manualLinkTracks_user_linkKey_unique").on(table.userId, table.linkKey),
    index("manualLinkTracks_externalProductId_idx").on(table.externalProductId),
    index("manualLinkTracks_status_createdAt_idx").on(table.status, table.createdAt),
    index("manualLinkTracks_status_nextRetryAt_idx").on(table.status, table.nextRetryAt),
  ]
);

export const googleDriveConnections = mysqlTable(
  "googleDriveConnections",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    refreshTokenCiphertext: text("refreshTokenCiphertext").notNull(),
    folderId: varchar("folderId", { length: 255 }).notNull(),
    snapshotFileId: varchar("snapshotFileId", { length: 255 }),
    candidateCsvFileId: varchar("candidateCsvFileId", { length: 255 }),
    userPriceCsvFileId: varchar("userPriceCsvFileId", { length: 255 }),
    connectedAt: timestamp("connectedAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("googleDriveConnections_user_unique").on(table.userId),
    index("googleDriveConnections_updatedAt_idx").on(table.updatedAt),
  ]
);

export const productCandidates = mysqlTable(
  "productCandidates",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    source: mysqlEnum("source", ["csv_upload", "drive_csv", "missing_search"]).notNull(),
    sourceKey: varchar("sourceKey", { length: 64 }).notNull(),
    name: varchar("name", { length: 500 }).notNull(),
    optionLabel: varchar("optionLabel", { length: 500 }),
    sourceUrl: text("sourceUrl"),
    notes: text("notes"),
    status: mysqlEnum("status", ["pending", "sent_to_tracking", "dismissed"]).default("pending").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("productCandidates_user_sourceKey_unique").on(table.userId, table.sourceKey),
    index("productCandidates_user_status_updated_idx").on(table.userId, table.status, table.updatedAt),
  ]
);

/** 관리자가 직접 등록하는 스마트스토어 외부 구매 유도용 핫딜입니다. */
export const smartstoreHotDeals = mysqlTable(
  "smartstoreHotDeals",
  {
    id: int("id").autoincrement().primaryKey(),
    title: varchar("title", { length: 500 }).notNull(),
    storeName: varchar("storeName", { length: 160 }).default("스마트스토어").notNull(),
    description: text("description"),
    imageUrl: text("imageUrl"),
    purchaseUrl: varchar("purchaseUrl", { length: 2_000 }).notNull(),
    regularPrice: int("regularPrice"),
    salePrice: int("salePrice").notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    startsAt: timestamp("startsAt"),
    endsAt: timestamp("endsAt"),
    createdBy: int("createdBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("smartstoreHotDeals_public_idx").on(table.isActive, table.startsAt, table.endsAt),
    index("smartstoreHotDeals_sort_created_idx").on(table.sortOrder, table.createdAt),
  ]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Product = typeof products.$inferSelect;
export type PriceHistoryPoint = typeof priceHistory.$inferSelect;
export type CollectedPriceHistoryPoint = typeof collectedPriceHistory.$inferSelect;
export type UserConfirmedPrice = typeof userConfirmedPrices.$inferSelect;
export type ProductCandidate = typeof productCandidates.$inferSelect;
export type SmartstoreHotDeal = typeof smartstoreHotDeals.$inferSelect;
