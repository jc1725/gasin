import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  createManualLinkTrack: vi.fn(),
  finishSyncRun: vi.fn(),
  importAdminConfirmedPrices: vi.fn(),
  listDeferredProductsForAdmin: vi.fn(),
  listLatestAdminConfirmedPrices: vi.fn(),
  saveAdminConfirmedPrice: vi.fn(),
  getGoogleDriveConnectionForUser: vi.fn(),
  importUserConfirmedPrices: vi.fn(),
  listLatestUserConfirmedPricesForFavorites: vi.fn(),
  listLatestUserConfirmedPricesForOwnedProducts: vi.fn(),
  listUserConfirmedPricesForProduct: vi.fn(),
  getProductCandidateForUser: vi.fn(),
  listProductCandidates: vi.fn(),
  markCandidateSentToTracking: vi.fn(),
  saveGoogleDriveCandidateCsvFile: vi.fn(),
  saveGoogleDriveUserPriceCsvFile: vi.fn(),
  startSyncRun: vi.fn(),
  upsertProductCandidates: vi.fn(),
  updateProductCandidateForUser: vi.fn(),
  deleteProductCandidateForUser: vi.fn(),
  deleteDeferredProductForAdmin: vi.fn(),
  markDeferredProductSoldOutForAdmin: vi.fn(),
  getStoredHomeCoupangLink: vi.fn(),
  loadCandidateCsvFromPersonalGoogleDrive: vi.fn(),
  loadUserConfirmedPriceCsvFromPersonalGoogleDrive: vi.fn(),
}));

vi.mock("./db", () => ({
  createManualLinkTrack: mocks.createManualLinkTrack,
  finishSyncRun: mocks.finishSyncRun,
  importAdminConfirmedPrices: mocks.importAdminConfirmedPrices,
  listDeferredProductsForAdmin: mocks.listDeferredProductsForAdmin,
  listLatestAdminConfirmedPrices: mocks.listLatestAdminConfirmedPrices,
  saveAdminConfirmedPrice: mocks.saveAdminConfirmedPrice,
  getGoogleDriveConnectionForUser: mocks.getGoogleDriveConnectionForUser,
  importUserConfirmedPrices: mocks.importUserConfirmedPrices,
  listLatestUserConfirmedPricesForFavorites: mocks.listLatestUserConfirmedPricesForFavorites,
  listLatestUserConfirmedPricesForOwnedProducts: mocks.listLatestUserConfirmedPricesForOwnedProducts,
  listUserConfirmedPricesForProduct: mocks.listUserConfirmedPricesForProduct,
  getProductCandidateForUser: mocks.getProductCandidateForUser,
  getProductById: vi.fn(),
  getProductDetail: vi.fn(),
  getGoogleDriveSnapshotConnection: vi.fn(),
  getSearchApiQuotaStatus: vi.fn(),
  isFavorite: vi.fn(),
  listFavoriteProducts: vi.fn(),
  listManualLinkTracks: vi.fn(),
  listProductCandidates: mocks.listProductCandidates,
  listProducts: vi.fn(),
  listRelatedProductVariants: vi.fn(),
  markCandidateSentToTracking: mocks.markCandidateSentToTracking,
  markProductViewed: vi.fn(),
  saveGoogleDriveCandidateCsvFile: mocks.saveGoogleDriveCandidateCsvFile,
  saveGoogleDriveUserPriceCsvFile: mocks.saveGoogleDriveUserPriceCsvFile,
  startSyncRun: mocks.startSyncRun,
  toggleFavorite: vi.fn(),
  upsertProductCandidates: mocks.upsertProductCandidates,
  updateProductCandidateForUser: mocks.updateProductCandidateForUser,
  deleteProductCandidateForUser: mocks.deleteProductCandidateForUser,
  deleteDeferredProductForAdmin: mocks.deleteDeferredProductForAdmin,
  markDeferredProductSoldOutForAdmin: mocks.markDeferredProductSoldOutForAdmin,
  getStoredHomeCoupangLink: mocks.getStoredHomeCoupangLink,
}));

vi.mock("./googleDrivePersonal", () => ({
  loadCandidateCsvFromPersonalGoogleDrive: mocks.loadCandidateCsvFromPersonalGoogleDrive,
  loadUserConfirmedPriceCsvFromPersonalGoogleDrive: mocks.loadUserConfirmedPriceCsvFromPersonalGoogleDrive,
}));

import { appRouter } from "./routers";

function googleContext(): TrpcContext {
  const now = new Date();
  return {
    user: { id: 21, openId: "google-user", name: "Google User", email: "jc1725@gmail.com", loginMethod: "google", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function normalUserContext(): TrpcContext {
  const now = new Date();
  return {
    user: { id: 22, openId: "google-normal-user", name: "Normal User", email: "normal@example.com", loginMethod: "google", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("candidate routes do not call Coupang", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchSpy);
    mocks.upsertProductCandidates.mockResolvedValue(1);
    mocks.startSyncRun.mockResolvedValue(88);
    mocks.finishSyncRun.mockResolvedValue(undefined);
    mocks.getGoogleDriveConnectionForUser.mockResolvedValue({ id: 3, userId: 21, refreshTokenCiphertext: "encrypted", folderId: "folder", candidateCsvFileId: "file", snapshotFileId: null });
    mocks.loadCandidateCsvFromPersonalGoogleDrive.mockResolvedValue({ action: "loaded", fileId: "file", csvText: "상품명,옵션명\n테스트 상품,1개\n" });
    mocks.loadUserConfirmedPriceCsvFromPersonalGoogleDrive.mockResolvedValue({ action: "loaded", fileId: "price-file", csvText: "상품명,확인일시,확인 가격,쿠팡 링크\n테스트 상품,2026-08-16,1000,https://www.coupang.com/vp/products/123456?itemId=234567&vendorItemId=345678\n" });
    mocks.importUserConfirmedPrices.mockResolvedValue({ importedCount: 1, duplicateCount: 0, unmatchedRows: [] });
    mocks.listLatestUserConfirmedPricesForOwnedProducts.mockResolvedValue([{ productId: 99, price: 19900, checkedAt: new Date("2026-08-16T09:00:00Z") }]);
    mocks.getProductCandidateForUser.mockResolvedValue({ id: 9, userId: 21, sourceUrl: "https://www.coupang.com/vp/products/12345", status: "pending" });
    mocks.createManualLinkTrack.mockResolvedValue({ track: { id: 4, status: "waiting" }, product: null });
    mocks.updateProductCandidateForUser.mockResolvedValue(undefined);
    mocks.deleteProductCandidateForUser.mockResolvedValue(undefined);
    mocks.deleteDeferredProductForAdmin.mockResolvedValue({ deleted: true });
    mocks.markDeferredProductSoldOutForAdmin.mockResolvedValue({ soldOut: true });
    mocks.getStoredHomeCoupangLink.mockResolvedValue({ url: "https://link.coupang.com/a/home" });
    mocks.listDeferredProductsForAdmin.mockResolvedValue([{ id: 77, externalProductId: "12345:23456:34567", name: "지연 상품", variantLabel: "1개", currentPrice: 10000, source: "search", refreshState: "deferred", lastRefreshReason: "쿼터 보호", affiliateUrl: "https://link.coupang.com/a/test" }]);
    mocks.listLatestAdminConfirmedPrices.mockResolvedValue([]);
    mocks.listUserConfirmedPricesForProduct.mockResolvedValue([{ id: 501, productId: 77, price: 8540, checkedAt: new Date("2026-08-16T10:00:00Z") }]);
    mocks.saveAdminConfirmedPrice.mockResolvedValue({ matched: true, importedCount: 1, duplicateCount: 0 });
    mocks.importAdminConfirmedPrices.mockResolvedValue({ importedCount: 1, duplicateCount: 0, unmatchedRows: [] });
  });

  it("rejects manual product management for a normal Google user", async () => {
    await expect(appRouter.createCaller(normalUserContext()).manualLinks.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(normalUserContext()).manualLinks.add({ url: "https://www.coupang.com/vp/products/12345?itemId=23456&vendorItemId=34567" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(normalUserContext()).candidates.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(normalUserContext()).adminPrices.listDeferred()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(normalUserContext()).adminPrices.removeDeferred({ productId: 77 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(normalUserContext()).adminPrices.markSoldOut({ productId: 77 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns user-confirmed price history for the product detail view without fetch", async () => {
    const result = await appRouter.createCaller(googleContext()).userPrices.listForProduct({ productId: 77 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ productId: 77, price: 8540 });
    expect(mocks.listUserConfirmedPricesForProduct).toHaveBeenCalledWith(21, 77);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns one stored home Coupang link without calling Coupang", async () => {
    const result = await appRouter.createCaller(normalUserContext()).catalog.homeCoupangLink();
    expect(result).toEqual({ url: "https://link.coupang.com/a/home" });
    expect(mocks.getStoredHomeCoupangLink).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lists deferred products and saves an admin-confirmed price without fetch", async () => {
    const caller = appRouter.createCaller(googleContext());
    const deferred = await caller.adminPrices.listDeferred();
    expect(deferred[0]).toMatchObject({ id: 77, refreshState: "deferred", confirmedPrice: null });
    const result = await caller.adminPrices.setManual({ productId: 77, price: 8540, checkedAt: "2026-08-16T10:00:00.000Z", note: "확인" });
    expect(result).toMatchObject({ matched: true, importedCount: 1 });
    expect(mocks.saveAdminConfirmedPrice).toHaveBeenCalledWith(21, 77, 8540, expect.any(Date), "확인");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("imports deferred prices from CSV without using fetch", async () => {
    const result = await appRouter.createCaller(googleContext()).adminPrices.importCsv({ csvText: "상품명,확인일시,확인 가격,쿠팡 링크,메모\n지연 상품,2026-08-16 19:00,8540,https://www.coupang.com/vp/products/12345?itemId=23456&vendorItemId=34567,확인\n" });
    expect(result).toMatchObject({ importedCount: 1, unmatchedRows: [] });
    expect(mocks.importAdminConfirmedPrices).toHaveBeenCalledWith(21, expect.any(Array));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("deletes a deferred product through the administrator route without calling Coupang", async () => {
    const result = await appRouter.createCaller(googleContext()).adminPrices.removeDeferred({ productId: 77 });
    expect(result).toEqual({ success: true });
    expect(mocks.deleteDeferredProductForAdmin).toHaveBeenCalledWith(77);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("marks a deferred product as sold out without calling Coupang", async () => {
    const result = await appRouter.createCaller(googleContext()).adminPrices.markSoldOut({ productId: 77 });
    expect(result).toEqual({ success: true });
    expect(mocks.markDeferredProductSoldOutForAdmin).toHaveBeenCalledWith(77);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("imports an uploaded CSV without using fetch or any Coupang client", async () => {
    const result = await appRouter.createCaller(googleContext()).candidates.importCsv({ csvText: "상품명,옵션명\n테스트 상품,1개\n" });
    expect(result).toEqual({ importedCount: 1, totalRows: 1 });
    expect(mocks.upsertProductCandidates).toHaveBeenCalledWith(21, "csv_upload", expect.any(Array));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("syncs a Drive CSV through the Drive dependency only and does not call Coupang", async () => {
    const result = await appRouter.createCaller(googleContext()).candidates.syncDriveCsv();
    expect(result).toMatchObject({ importedCount: 1, action: "loaded" });
    expect(mocks.loadCandidateCsvFromPersonalGoogleDrive).toHaveBeenCalledTimes(1);
    expect(mocks.upsertProductCandidates).toHaveBeenCalledWith(21, "drive_csv", expect.any(Array));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("imports user-confirmed prices without using fetch or a Coupang client", async () => {
    const result = await appRouter.createCaller(googleContext()).userPrices.importCsv({ csvText: "상품명,확인일시,확인 가격,쿠팡 링크\n테스트 상품,2026-08-16,1000,https://www.coupang.com/vp/products/123456?itemId=234567&vendorItemId=345678\n" });
    expect(result).toMatchObject({ importedCount: 1, unmatchedRows: [] });
    expect(mocks.importUserConfirmedPrices).toHaveBeenCalledWith(21, expect.any(Array));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("syncs user-confirmed prices from Drive without calling Coupang", async () => {
    const result = await appRouter.createCaller(googleContext()).userPrices.syncDriveCsv();
    expect(result).toMatchObject({ importedCount: 1, action: "loaded" });
    expect(mocks.loadUserConfirmedPriceCsvFromPersonalGoogleDrive).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns latest user-confirmed prices through the user-scoped DB helper without calling Coupang", async () => {
    const result = await appRouter.createCaller(googleContext()).userPrices.listLatestForProducts({ productIds: [99] });
    expect(result).toHaveLength(1);
    expect(mocks.listLatestUserConfirmedPricesForOwnedProducts).toHaveBeenCalledWith(21, [99]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("updates a candidate without using fetch", async () => {
    const result = await appRouter.createCaller(googleContext()).candidates.update({ candidateId: 9, name: "수정 상품", optionLabel: "2개", sourceUrl: "https://www.coupang.com/vp/products/12345", notes: "메모" });
    expect(result).toEqual({ success: true });
    expect(mocks.updateProductCandidateForUser).toHaveBeenCalledWith(21, 9, { name: "수정 상품", optionLabel: "2개", sourceUrl: "https://www.coupang.com/vp/products/12345", notes: "메모" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("deletes a candidate without using fetch", async () => {
    const result = await appRouter.createCaller(googleContext()).candidates.remove({ candidateId: 9 });
    expect(result).toEqual({ success: true });
    expect(mocks.deleteProductCandidateForUser).toHaveBeenCalledWith(21, 9);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("moves only an already supplied URL to the existing manual-link waiting flow without fetch", async () => {
    const result = await appRouter.createCaller(googleContext()).candidates.sendToTracking({ candidateId: 9 });
    expect(result.track.status).toBe("waiting");
    expect(mocks.createManualLinkTrack).toHaveBeenCalledTimes(1);
    expect(mocks.markCandidateSentToTracking).toHaveBeenCalledWith(21, 9);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
