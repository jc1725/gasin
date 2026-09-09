import { Activity, Check, CircleOff, Copy, ExternalLink, Gem, Heart, Link2, LogIn, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, TrendingUp, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getProductMetaTags } from "@/lib/productMeta";
import { getProductDisplayName, getProductOptionDisplayLabel } from "@/lib/productDisplayName";
import { createCoupangProductUrl, createCoupangSearchUrl } from "@/lib/coupangSearchUrl";
import { describeDeepLinkFailure } from "@/lib/deepLinkFailureReason";
import { hasCollectorVerifiedPurchasePath } from "@/lib/collectorVerifiedPurchase";
import { describeRecheckReason } from "@/lib/recheckReason";
import { filterProductsNeedingConfirmation, getAdminConfirmationStatus } from "@/lib/adminConfirmationStatus";
import { isAdminUser } from "@shared/const";
import { filterAdminProducts } from "@/lib/adminProductSearch";

type OptionDraft = { option: string; capacity: string; quantity: string };
type DeepLinkRefreshCardResult = { status: "ready" | "collector_verified" | "not_found" | "rate_limited" | "pending" | "error"; message: string };
const won = (value: number) => `${new Intl.NumberFormat("ko-KR").format(value)}원`;
const formatDate = (value: Date) => new Date(value).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const ADMIN_PAGE_SIZE = 10;

function PageControls({ page, total, onChange, label }: { page: number; total: number; onChange: (page: number) => void; label: string }) {
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  if (pageCount <= 1) return null;
  return <div className="mt-3 flex items-center justify-center gap-2" aria-label={`${label} 페이지네이션`}><button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="min-h-9 rounded-xl border border-[#cfe3d2] bg-white px-3 text-[10px] font-bold text-[#176b3a] disabled:opacity-40">이전</button><span className="text-[10px] font-bold text-[#607765]">{page} / {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => onChange(page + 1)} className="min-h-9 rounded-xl border border-[#cfe3d2] bg-white px-3 text-[10px] font-bold text-[#176b3a] disabled:opacity-40">다음</button></div>;
}

function getDeepLinkRefreshResultPresentation(status: DeepLinkRefreshCardResult["status"]) {
  if (status === "ready") return { title: "딥링크 갱신 완료", className: "border-[#b9d8c0] bg-[#f1fbf3] text-[#176b3a]" };
  if (status === "collector_verified") return { title: "수집기 확인 구매 경로 유지", className: "border-[#b9d8c0] bg-[#f1fbf3] text-[#176b3a]" };
  if (status === "rate_limited") return { title: "딥링크 갱신 대기", className: "border-[#cbdcf2] bg-[#f2f7ff] text-[#3567a8]" };
  if (status === "pending") return { title: "수집기 확인 딥링크 생성 대기", className: "border-[#ecd09f] bg-[#fffaf0] text-[#94601a]" };
  if (status === "not_found") return { title: "딥링크 갱신 결과", className: "border-[#f0ddbf] bg-[#fffaf1] text-[#7b581d]" };
  return { title: "딥링크 갱신 실패", className: "border-[#edc8c3] bg-[#fff8f7] text-[#a44c45]" };
}

function composeVariantLabel(draft: OptionDraft) {
  return [draft.option.trim(), draft.capacity.trim(), draft.quantity.trim() ? `${draft.quantity.trim()}개` : ""].filter(Boolean).join(" · ") || null;
}

function createOptionDraft(variantLabel: string | null, unitLabel: string | null): OptionDraft {
  const tags = getProductMetaTags(variantLabel, unitLabel);
  const option = (variantLabel ?? "")
    .split("·")
    .map(value => value.trim())
    .filter(value => value && value !== tags.capacity && value !== tags.quantity)
    .join(" · ");
  return { option, capacity: tags.capacity ?? unitLabel ?? "", quantity: tags.quantity?.replace(/[^0-9]/g, "") ?? "" };
}

export default function AdminPrices() {
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = isAdminUser(user);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [optionDrafts, setOptionDrafts] = useState<Record<number, OptionDraft>>({});
  const [editingOptionIds, setEditingOptionIds] = useState<Set<number>>(new Set());
  const [productQuery, setProductQuery] = useState("");
  const [showOnlyNeedsConfirmation, setShowOnlyNeedsConfirmation] = useState(true);
  const [showOnlyMissingImage, setShowOnlyMissingImage] = useState(false);
  const [showOnlySoldOut, setShowOnlySoldOut] = useState(false);
  const [includeAutomaticDeferred, setIncludeAutomaticDeferred] = useState(false);
  const [showOnlyAwaitingCollection, setShowOnlyAwaitingCollection] = useState(false);
  const [showOnlyUnmatchedSku, setShowOnlyUnmatchedSku] = useState(false);
  const [showFailedPriceRuns, setShowFailedPriceRuns] = useState(false);
  const [registeredMissingSearchIds, setRegisteredMissingSearchIds] = useState<Set<number>>(new Set());
  const [selectedMerge, setSelectedMerge] = useState<{ sourceProductId: number; targetProductId: number } | null>(null);
  const [deepLinkRefreshResults, setDeepLinkRefreshResults] = useState<Record<number, DeepLinkRefreshCardResult>>({});
  const [copiedCollectorProductId, setCopiedCollectorProductId] = useState<number | null>(null);
  const [currentPriceQuery, setCurrentPriceQuery] = useState("");
  const [showOnlyMissingOption, setShowOnlyMissingOption] = useState(false);
  const [currentPricePage, setCurrentPricePage] = useState(1);
  const [selectedCurrentPriceIds, setSelectedCurrentPriceIds] = useState<Set<number>>(new Set());
  const [missingSearchPage, setMissingSearchPage] = useState(1);
  const [deferredPage, setDeferredPage] = useState(1);

  const deferred = trpc.adminPrices.listDeferred.useQuery({ imageMissingOnly: showOnlyMissingImage && !showOnlySoldOut && !showOnlyAwaitingCollection, soldOutOnly: showOnlySoldOut, automaticOnly: includeAutomaticDeferred && !showOnlySoldOut && !showOnlyMissingImage && !showOnlyUnmatchedSku && !showOnlyAwaitingCollection, unmatchedSkuOnly: showOnlyUnmatchedSku && !showOnlySoldOut && !showOnlyMissingImage && !showOnlyAwaitingCollection, awaitingCollectionOnly: showOnlyAwaitingCollection && !showOnlySoldOut && !showOnlyMissingImage && !includeAutomaticDeferred && !showOnlyUnmatchedSku, manualOnly: showOnlyNeedsConfirmation && !showOnlySoldOut && !showOnlyMissingImage && !includeAutomaticDeferred && !showOnlyUnmatchedSku && !showOnlyAwaitingCollection }, { enabled: isAdmin });
  useEffect(() => {
    if (showOnlySoldOut || showOnlyMissingImage || includeAutomaticDeferred || showOnlyUnmatchedSku) setShowOnlyAwaitingCollection(false);
  }, [showOnlySoldOut, showOnlyMissingImage, includeAutomaticDeferred, showOnlyUnmatchedSku]);
  const deferredSummary = trpc.adminPrices.deferredInputSummary.useQuery(undefined, { enabled: isAdmin, refetchInterval: 60_000 });
  const missingOptions = trpc.adminPrices.listMissingOptions.useQuery(undefined, { enabled: isAdmin });
  const missingSearches = trpc.adminPrices.listMissingSearches.useQuery(undefined, { enabled: isAdmin });
  const goldBoxSyncStatus = trpc.adminPrices.goldBoxSyncStatus.useQuery(undefined, { enabled: isAdmin });
  const priceRefreshStats = trpc.adminPrices.priceRefreshStats24h.useQuery(undefined, { enabled: isAdmin, refetchInterval: 60_000 });
  const performanceMetrics = trpc.adminPrices.priceTrackingPerformanceMetrics.useQuery({ days: 7 }, { enabled: isAdmin, refetchInterval: 60_000 });
  const failedPriceRuns = trpc.adminPrices.failedPriceRefreshRuns24h.useQuery(undefined, { enabled: isAdmin && showFailedPriceRuns });
  const collectorSyncStatus = trpc.adminPrices.collectorSyncStatus.useQuery(undefined, { enabled: isAdmin });
  const duplicateCandidates = trpc.adminPrices.listDuplicateCandidates.useQuery(undefined, { enabled: isAdmin });
  const mergePreview = trpc.adminPrices.duplicateMergePreview.useQuery(selectedMerge ?? { sourceProductId: 1, targetProductId: 2 }, { enabled: isAdmin && selectedMerge !== null });
  const currentPriceProducts = trpc.adminPrices.listCurrentPriceProducts.useQuery(undefined, { enabled: isAdmin });
  const addMissingSearchCandidate = trpc.adminPrices.addMissingSearchCandidate.useMutation();
  const deleteMissingSearch = trpc.adminPrices.deleteMissingSearch.useMutation({ onError: error => toast.error(error.message) });
  const mergeDuplicateMissingSearches = trpc.adminPrices.mergeDuplicateMissingSearches.useMutation({
    onSuccess: async result => { await missingSearches.refetch(); toast.success(`의미가 같은 검색 실패 이력 ${result.rowsRemoved}건을 통합했습니다.`); },
    onError: error => toast.error(error.message),
  });
  const pruneResolvedMissingSearches = trpc.adminPrices.pruneResolvedMissingSearches.useMutation({
    onSuccess: async result => {
      await missingSearches.refetch();
      toast.success(result.removed > 0 ? `저장 상품과 일치한 실패 이력 ${result.removed}개를 정리했습니다.` : `현재 실패 이력 ${result.checked}개는 저장 상품과 아직 일치하지 않습니다.`);
    },
    onError: error => toast.error(error.message),
  });
  const removeDeferred = trpc.adminPrices.removeDeferred.useMutation({ onError: error => toast.error(error.message) });
  const markSoldOut = trpc.adminPrices.markSoldOut.useMutation({ onError: error => toast.error(error.message) });
  const markCurrentPriceProductSoldOut = trpc.adminPrices.markCurrentPriceProductSoldOut.useMutation({ onSuccess: async () => { await Promise.all([utils.adminPrices.listCurrentPriceProducts.invalidate(), utils.catalog.list.invalidate(), utils.favorites.list.invalidate()]); toast.success("가격 추이 상품을 품절 처리했습니다."); }, onError: error => toast.error(error.message) });
  const deleteCurrentPriceProduct = trpc.adminPrices.deleteCurrentPriceProduct.useMutation({ onSuccess: async () => { await Promise.all([utils.adminPrices.listCurrentPriceProducts.invalidate(), utils.catalog.list.invalidate()]); toast.success("가격 추이 상품을 삭제했습니다."); }, onError: error => toast.error(error.message) });
  const deleteCurrentPriceProducts = trpc.adminPrices.deleteCurrentPriceProducts.useMutation({ onSuccess: async result => { setSelectedCurrentPriceIds(new Set()); await Promise.all([utils.adminPrices.listCurrentPriceProducts.invalidate(), utils.catalog.list.invalidate(), utils.favorites.list.invalidate()]); toast.success(`${result.deletedCount}개 상품을 삭제했습니다.${result.skippedCount ? ` ${result.skippedCount}개는 이미 삭제되어 건너뛰었습니다.` : ""}`); }, onError: error => toast.error(error.message) });
  const save = trpc.adminPrices.setManual.useMutation({ onError: error => toast.error(error.message) });
  const updateOptions = trpc.adminPrices.updateOptions.useMutation({
    onSuccess: async result => {
      await Promise.all([utils.adminPrices.listMissingOptions.invalidate(), utils.adminPrices.listDeferred.invalidate(), utils.adminPrices.deferredInputSummary.invalidate(), utils.adminPrices.listCurrentPriceProducts.invalidate()]);
      toast.success(`${result.updatedCount}개 상품의 옵션 정보를 저장했습니다.`);
    },
    onError: error => toast.error(error.message),
  });
  const refreshGoldBox = trpc.adminPrices.refreshGoldBox.useMutation({
    onSuccess: async result => {
      await Promise.all([
        utils.adminPrices.goldBoxSyncStatus.invalidate(),
        utils.adminPrices.listDeferred.invalidate(),
        utils.catalog.list.invalidate(),
        utils.catalog.homeFeatured.invalidate(),
      ]);
      toast.success(result.skipped ? (result.detail ?? "GoldBox 갱신을 보호 모드로 보류했습니다.") : `GoldBox 상품 ${result.processedCount}개를 갱신했습니다.`);
    },
    onError: error => toast.error(error.message),
  });
  const refreshDeepLink = trpc.adminPrices.refreshDeepLink.useMutation({
    onSuccess: async (result, variables) => {
      setDeepLinkRefreshResults(previous => ({ ...previous, [variables.productId]: result }));
      await Promise.all([
        utils.adminPrices.deferredInputSummary.invalidate(),
        utils.catalog.product.invalidate(),
      ]);
    },
    onError: (error, variables) => setDeepLinkRefreshResults(previous => ({
      ...previous,
      [variables.productId]: { status: "error", message: error.message || "딥링크 갱신 중 알 수 없는 오류가 발생했습니다." },
    })),
  });
  const enqueueAllSearchProductsForPriceRefresh = trpc.adminPrices.enqueueAllSearchProductsForPriceRefresh.useMutation({
    onSuccess: async result => {
      await Promise.all([
        utils.adminPrices.listDeferred.invalidate(),
        utils.adminPrices.deferredInputSummary.invalidate(),
        utils.adminPrices.priceRefreshStats24h.invalidate(),
      ]);
      toast.success(result.detail);
    },
    onError: error => toast.error(error.message),
  });
  const enqueueFavoritedProductsForPriceRefresh = trpc.adminPrices.enqueueFavoritedProductsForPriceRefresh.useMutation({
    onSuccess: async result => {
      await Promise.all([
        utils.adminPrices.listDeferred.invalidate(),
        utils.adminPrices.deferredInputSummary.invalidate(),
        utils.adminPrices.priceRefreshStats24h.invalidate(),
      ]);
      toast.success(result.detail);
    },
    onError: error => toast.error(error.message),
  });
  const collectorMetadataSync = trpc.adminPrices.syncCollectorMetadata.useMutation({
    onSuccess: async result => {
      await Promise.all([utils.adminPrices.listMissingOptions.invalidate(), utils.adminPrices.listDeferred.invalidate(), utils.catalog.list.invalidate(), utils.catalog.homeFeatured.invalidate()]);
      toast.success(result.detail);
    },
    onError: error => toast.error(error.message),
  });
  const collectorSync = trpc.adminPrices.syncCollectedPrices.useMutation({
    onSuccess: async result => {
      await Promise.all([
        utils.adminPrices.collectorSyncStatus.invalidate(),
        utils.adminPrices.listDeferred.invalidate(),
        utils.catalog.list.invalidate(),
        utils.catalog.homeFeatured.invalidate(),
      ]);
      toast.success(`수집 최신값 ${result.observedCount}개 중 ${result.updatedCount}개 상품 가격을 반영했습니다.`);
    },
    onError: error => toast.error(error.message),
  });
  const mergeDuplicates = trpc.adminPrices.mergeDuplicates.useMutation({
    onSuccess: async result => {
      await Promise.all([
        utils.adminPrices.listDuplicateCandidates.invalidate(),
        utils.adminPrices.listDeferred.invalidate(),
        utils.catalog.list.invalidate(),
        utils.catalog.homeFeatured.invalidate(),
        utils.catalog.product.invalidate({ productId: result.targetProductId }),
      ]);
      setSelectedMerge(null);
      toast.success(`상품을 병합했습니다. 가격 이력 ${result.movedPriceHistory}건을 이관했고 중복 이력 ${result.removedDuplicatePriceHistory}건을 정리했습니다.`);
    },
    onError: error => toast.error(error.message),
  });

  const sortedProducts = useMemo(() => [...(deferred.data ?? [])].sort((left, right) => {
    const leftTime = new Date(left.confirmedPrice?.checkedAt ?? left.lastSeenAt).getTime();
    const rightTime = new Date(right.confirmedPrice?.checkedAt ?? right.lastSeenAt).getTime();
    return leftTime - rightTime || left.name.localeCompare(right.name, "ko");
  }), [deferred.data]);
  const filteredProducts = useMemo(() => {
    const searched = filterAdminProducts(sortedProducts, productQuery);
    return showOnlyNeedsConfirmation && !showOnlySoldOut ? filterProductsNeedingConfirmation(searched) : searched;
  }, [productQuery, showOnlyNeedsConfirmation, showOnlySoldOut, sortedProducts]);
  const missingOptionIds = useMemo(() => new Set((missingOptions.data ?? []).map(product => product.id)), [missingOptions.data]);
  const currentPriceFiltered = useMemo(() => {
    const filtered = filterAdminProducts(currentPriceProducts.data ?? [], currentPriceQuery);
    return showOnlyMissingOption
      ? filtered.filter(product => !product.variantLabel && !product.unitLabel && !product.quantity && !product.packSize)
      : filtered;
  }, [currentPriceProducts.data, currentPriceQuery, showOnlyMissingOption]);
  const missingOptionCount = useMemo(() => (currentPriceProducts.data ?? []).filter(product => !product.variantLabel && !product.unitLabel && !product.quantity && !product.packSize).length, [currentPriceProducts.data]);
  const currentPricePageItems = useMemo(() => currentPriceFiltered.slice((currentPricePage - 1) * ADMIN_PAGE_SIZE, currentPricePage * ADMIN_PAGE_SIZE), [currentPriceFiltered, currentPricePage]);
  const currentPricePageIds = useMemo(() => currentPricePageItems.map(product => product.id), [currentPricePageItems]);
  const allCurrentPricePageSelected = currentPricePageIds.length > 0 && currentPricePageIds.every(productId => selectedCurrentPriceIds.has(productId));
  const missingSearchPageItems = useMemo(() => (missingSearches.data ?? []).slice((missingSearchPage - 1) * ADMIN_PAGE_SIZE, missingSearchPage * ADMIN_PAGE_SIZE), [missingSearches.data, missingSearchPage]);
  const deferredPageItems = useMemo(() => filteredProducts.slice((deferredPage - 1) * ADMIN_PAGE_SIZE, deferredPage * ADMIN_PAGE_SIZE), [filteredProducts, deferredPage]);
  useEffect(() => { setCurrentPricePage(1); setSelectedCurrentPriceIds(new Set()); }, [currentPriceQuery]);
  useEffect(() => { if (currentPricePage > Math.max(1, Math.ceil(currentPriceFiltered.length / ADMIN_PAGE_SIZE))) setCurrentPricePage(1); }, [currentPriceFiltered.length, currentPricePage]);
  useEffect(() => { if (missingSearchPage > Math.max(1, Math.ceil((missingSearches.data?.length ?? 0) / ADMIN_PAGE_SIZE))) setMissingSearchPage(1); }, [missingSearches.data?.length, missingSearchPage]);
  useEffect(() => { if (deferredPage > Math.max(1, Math.ceil(filteredProducts.length / ADMIN_PAGE_SIZE))) setDeferredPage(1); }, [deferredPage, filteredProducts.length]);
  const refreshChartData = useMemo(() => (priceRefreshStats.data?.hourly ?? []).map(bucket => ({
    time: new Date(bucket.startedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
    processedCount: bucket.processedCount,
    successRate: bucket.successRate,
    runs: bucket.runs,
  })), [priceRefreshStats.data]);

  useEffect(() => {
    if (!missingOptions.data) return;
    setOptionDrafts(previous => {
      const next = { ...previous };
      for (const product of missingOptions.data) {
        if (!next[product.id]) next[product.id] = createOptionDraft(product.variantLabel, product.unitLabel);
      }
      return next;
    });
  }, [missingOptions.data]);

  const updateDraft = (productId: number, field: keyof OptionDraft, value: string) => setOptionDrafts(previous => ({
    ...previous,
    [productId]: { ...(previous[productId] ?? { option: "", capacity: "", quantity: "" }), [field]: value },
  }));

  const toggleOptionEditor = (product: { id: number; variantLabel: string | null; unitLabel: string | null }) => {
    setOptionDrafts(previous => previous[product.id] ? previous : { ...previous, [product.id]: createOptionDraft(product.variantLabel, product.unitLabel) });
    setEditingOptionIds(previous => {
      const next = new Set(previous);
      if (next.has(product.id)) next.delete(product.id);
      else next.add(product.id);
      return next;
    });
  };

  const savePrice = (productId: number) => {
    const price = Number((drafts[productId] ?? "").replace(/[₩원,\s]/g, ""));
    if (!Number.isSafeInteger(price) || price <= 0) return toast.error("확인 가격을 원 단위 정수로 입력해 주세요.");
    save.mutate({ productId, price, checkedAt: new Date().toISOString(), note: "관리자 직접 확인" }, {
      onSuccess: async result => {
        if (!result.matched) return;
        await Promise.all([utils.adminPrices.listDeferred.invalidate(), utils.adminPrices.deferredInputSummary.invalidate(), utils.userPrices.listForProduct.invalidate({ productId }), utils.catalog.product.invalidate({ productId })]);
        setDrafts(previous => ({ ...previous, [productId]: "" }));
        toast.success("확인 가격을 저장했습니다.");
      },
    });
  };

  const saveCombinedProduct = (productId: number) => {
    const priceText = drafts[productId]?.trim() ?? "";
    if (priceText) {
      const price = Number(priceText.replace(/[₩원,\s]/g, ""));
      if (!Number.isSafeInteger(price) || price <= 0) return toast.error("확인 가격을 원 단위 정수로 입력해 주세요.");
    }
    const draft = optionDrafts[productId] ?? { option: "", capacity: "", quantity: "" };
    const quantity = draft.quantity.trim() ? Number(draft.quantity.trim()) : null;
    updateOptions.mutate({ rows: [{ productId, variantLabel: composeVariantLabel(draft), unitLabel: draft.capacity.trim() || null, quantity: Number.isInteger(quantity) && (quantity ?? 0) > 0 ? quantity : null }] }, {
      onSuccess: async () => {
        setEditingOptionIds(previous => {
          const next = new Set(previous);
          next.delete(productId);
          return next;
        });
        await Promise.all([utils.adminPrices.listMissingOptions.invalidate(), utils.adminPrices.listCurrentPriceProducts.invalidate()]);
        if (priceText) savePrice(productId);
        else toast.success("옵션 정보를 저장했습니다.");
      },
    });
  };

  const registerMissingSearchCandidate = (missingSearchId: number, keyword: string) => {
    addMissingSearchCandidate.mutate({ keyword }, {
      onSuccess: async result => {
        setRegisteredMissingSearchIds(previous => new Set(previous).add(missingSearchId));
        await utils.candidates.list.invalidate();
        toast.success(result.created ? "신규 상품 후보로 등록했습니다." : "이미 후보 보관함에 등록된 검색어입니다.");
      },
      onError: error => toast.error(error.message),
    });
  };

  const deleteMissingSearchItem = (missingSearchId: number, keyword: string) => {
    if (!window.confirm(`검색 실패 이력 '${keyword}'을(를) 삭제할까요?\n삭제 후에는 같은 검색어가 다시 실패할 때 새 이력으로 집계됩니다.`)) return;
    deleteMissingSearch.mutate({ missingSearchId }, {
      onSuccess: async () => {
        setRegisteredMissingSearchIds(previous => {
          const next = new Set(previous);
          next.delete(missingSearchId);
          return next;
        });
        await utils.adminPrices.listMissingSearches.invalidate();
        toast.success("검색 실패 이력을 삭제했습니다.");
      },
    });
  };

  const removeDeferredProduct = (productId: number, name: string) => {
    if (!window.confirm(`보류 상품 '${name}'을(를) 삭제할까요?\n가격 이력과 연결된 추적 정보도 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    removeDeferred.mutate({ productId }, {
      onSuccess: async () => {
        await Promise.all([
          utils.adminPrices.listDeferred.invalidate(),
          utils.adminPrices.listMissingOptions.invalidate(),
          utils.catalog.list.invalidate(),
        ]);
        toast.success("보류 상품을 삭제했습니다.");
      },
    });
  };

  const markDeferredProductSoldOut = (productId: number, name: string) => {
    if (!window.confirm(`보류 상품 '${name}'을(를) 품절 처리할까요?\n가격 이력은 보존되지만, 일반 상품·검색·찜 목록에서는 숨겨집니다.`)) return;
    markSoldOut.mutate({ productId }, {
      onSuccess: async () => {
        await Promise.all([
          utils.adminPrices.listDeferred.invalidate(),
          utils.adminPrices.listMissingOptions.invalidate(),
          utils.catalog.list.invalidate(),
          utils.favorites.list.invalidate(),
        ]);
        toast.success("상품을 품절 처리했습니다.");
      },
    });
  };

  const enqueueAllForPriceRefresh = () => {
    if (!window.confirm("검색 등록 활성 상품 전체를 가격 재확인 대기열에 넣을까요?\n\n쿠팡 API를 즉시 한꺼번에 호출하지 않습니다. 등록 후 외부 자동 실행이 오래된 상품부터 최대 10개씩 순차 처리합니다. 외부 실행 주기는 관리자 등록 스케줄에 따릅니다.")) return;
    enqueueAllSearchProductsForPriceRefresh.mutate();
  };

  const enqueueFavoritedForPriceRefresh = () => {
    if (!window.confirm("현재 찜한 상품만 수집기 가격 업데이트 대상으로 등록할까요?\n\n쿠팡 API를 호출하지 않습니다. 수집기가 상품 페이지를 직접 방문해 관측값을 전송하면 가격과 옵션이 갱신됩니다. 품절·비활성 상품은 제외됩니다.")) return;
    enqueueFavoritedProductsForPriceRefresh.mutate();
  };

  const refreshProductDeepLink = (productId: number, name: string) => {
    if (!window.confirm(`'${name}'의 딥링크를 갱신할까요?\n쿠팡 공식 검색 결과에서 productId·itemId·vendorItemId가 모두 일치할 때만 새 링크를 만듭니다.`)) return;
    refreshDeepLink.mutate({ productId });
  };

  const copyCollectorProductId = async (productRowId: number, coupangProductId: string) => {
    if (!coupangProductId) return toast.error("복사할 쿠팡 상품 ID가 없습니다.");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(coupangProductId);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = coupangProductId;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopiedCollectorProductId(productRowId);
      window.setTimeout(() => setCopiedCollectorProductId(current => current === productRowId ? null : current), 1_800);
      toast.success("쿠팡 상품 ID를 복사했습니다.");
    } catch {
      toast.error("상품 ID를 복사하지 못했습니다. 다시 시도해 주세요.");
    }
  };

  const confirmDuplicateMerge = () => {
    if (!selectedMerge || !mergePreview.data) return;
    const { source, counts } = mergePreview.data;
    if (!window.confirm(`'${source.name}' 레거시 상품을 정확 옵션 SKU 상품으로 병합할까요?\n\n가격 이력 ${counts.priceHistoryToMove}건, 확인 가격 ${counts.userConfirmedPricesToMove}건, 찜·알림 설정을 보존합니다. 원본 상품은 삭제하지 않고 검색에서만 숨깁니다.`)) return;
    mergeDuplicates.mutate(selectedMerge);
  };

  const markCurrentProductSoldOut = (productId: number, name: string) => {
    if (!window.confirm(`가격 추이 상품 '${name}'을(를) 품절 처리할까요?\n가격 이력은 보존되고 일반 목록에서는 숨겨집니다.`)) return;
    markCurrentPriceProductSoldOut.mutate({ productId });
  };

  const deleteCurrentProduct = (productId: number, name: string) => {
    if (!window.confirm(`가격 추이 상품 '${name}'을(를) 영구 삭제할까요?\n가격 이력과 찜·알림 연결도 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    deleteCurrentPriceProduct.mutate({ productId });
  };

  const deleteSelectedCurrentProducts = () => {
    const productIds = Array.from(selectedCurrentPriceIds);
    if (productIds.length === 0) return;
    if (!window.confirm(`선택한 ${productIds.length}개 가격 추이 상품을 영구 삭제할까요?\n가격 이력과 찜·알림 연결도 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    deleteCurrentPriceProducts.mutate({ productIds });
  };


  if (loading) return <p className="py-24 text-center text-sm text-[#829184]">관리자 확인 중입니다.</p>;
  if (!user) return <section className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-[#e2ebe1]"><ShieldCheck className="mx-auto size-8 text-[#176b3a]" /><h1 className="mt-3 text-lg font-extrabold">관리자 로그인</h1><p className="mt-2 text-xs leading-5 text-[#718071]">관리자 계정으로 로그인해야 가격 관리 메뉴를 사용할 수 있습니다.</p><a href="/api/auth/google" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#176b3a] px-5 text-xs font-bold text-white"><LogIn className="size-4" />Google 로그인</a></section>;
  if (!isAdmin) return <section className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-[#e2ebe1]"><ShieldCheck className="mx-auto size-8 text-[#a44c45]" /><h1 className="mt-3 text-lg font-extrabold">접근 권한이 없습니다</h1><p className="mt-2 text-xs leading-5 text-[#718071]">지정된 관리자 계정만 이 메뉴를 볼 수 있습니다.</p></section>;

  return <section>
    <div className="mb-4 grid gap-3 md:grid-cols-2">
      <section className="rounded-3xl bg-[#176b3a] p-4 text-white shadow-[0_12px_30px_rgba(23,107,58,.2)]">
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/15"><TrendingUp className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-xs font-extrabold">전체 가격 재확인 대기열</p><p className="mt-1 text-[10px] leading-4 text-[#d9f0dd]">대기 조건과 관계없이 검색 등록 활성 상품을 재확인 대기열에 넣습니다. 등록 뒤 자동 실행이 설정된 배치 한도에 따라 순차 처리합니다.</p></div></div>
        <button type="button" onClick={enqueueAllForPriceRefresh} disabled={enqueueAllSearchProductsForPriceRefresh.isPending || enqueueFavoritedProductsForPriceRefresh.isPending} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-extrabold text-[#176b3a] disabled:opacity-60"><RefreshCw className={`size-3.5 ${enqueueAllSearchProductsForPriceRefresh.isPending ? "animate-spin" : ""}`} />{enqueueAllSearchProductsForPriceRefresh.isPending ? "대기열 등록 중" : "전체 상품 대기열 등록"}</button>
      </section>
      <section className="rounded-3xl bg-[#2f8050] p-4 text-white shadow-[0_12px_30px_rgba(47,128,80,.2)]">
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/15"><Heart className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-xs font-extrabold">찜한 상품만 가격 업데이트</p><p className="mt-1 text-[10px] leading-4 text-[#e0f4e5]">현재 사용자가 찜한 활성·재고 보유 상품만 수집기 관측 대기 대상으로 등록합니다. 수집기가 상품 페이지를 직접 방문해야 가격이 갱신되며, 중복 찜은 한 번만 처리합니다.</p></div></div>
        <button type="button" onClick={enqueueFavoritedForPriceRefresh} disabled={enqueueFavoritedProductsForPriceRefresh.isPending || enqueueAllSearchProductsForPriceRefresh.isPending} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-extrabold text-[#246b42] disabled:opacity-60"><Heart className={`size-3.5 ${enqueueFavoritedProductsForPriceRefresh.isPending ? "animate-pulse" : ""}`} />{enqueueFavoritedProductsForPriceRefresh.isPending ? "찜 상품 등록 중" : "찜한 상품만 수집기 가격 업데이트"}</button>
      </section>
    </div>
    <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-[#e2ebe1]"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#308154]">TRACKING PERFORMANCE</p><h2 className="mt-1 text-lg font-extrabold text-[#25362a]">가격 추적 성과 모니터링</h2><p className="mt-1 text-[11px] leading-4 text-[#718071]">최근 7일 기준 보류 SKU 해소 시간, 상품당 API 호출과 해결 경로를 추적합니다.</p></div><button type="button" onClick={() => performanceMetrics.refetch()} className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f4fbf5] text-[#176b3a]" aria-label="가격 추적 성과 새로고침"><RefreshCw className={`size-4 ${performanceMetrics.isFetching ? "animate-spin" : ""}`} /></button></div>{performanceMetrics.isLoading ? <p className="py-8 text-center text-xs text-[#718071]">성과 지표를 계산하는 중입니다.</p> : null}{performanceMetrics.data ? <><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-2xl bg-[#f4fbf5] p-3"><p className="text-[10px] font-bold text-[#718071]">보류 SKU 평균 해소</p><p className="mt-2 text-xl font-extrabold text-[#176b3a]">{performanceMetrics.data.summary.avgResolutionHours == null ? "-" : performanceMetrics.data.summary.avgResolutionHours}<span className="ml-1 text-[10px]">시간</span></p></div><div className="rounded-2xl bg-[#f4fbf5] p-3"><p className="text-[10px] font-bold text-[#718071]">상품당 API 호출</p><p className="mt-2 text-xl font-extrabold text-[#25362a]">{performanceMetrics.data.summary.avgApiCallsPerProduct}<span className="ml-1 text-[10px]">회</span></p></div><div className="rounded-2xl bg-[#f4fbf5] p-3"><p className="text-[10px] font-bold text-[#718071]">정상 해소율</p><p className="mt-2 text-xl font-extrabold text-[#176b3a]">{performanceMetrics.data.summary.successRate}<span className="ml-1 text-[10px]">%</span></p></div><div className="rounded-2xl bg-[#fffaf0] p-3"><p className="text-[10px] font-bold text-[#94601a]">수집기 해소 비율</p><p className="mt-2 text-xl font-extrabold text-[#94601a]">{performanceMetrics.data.summary.collectorResolutionRate}<span className="ml-1 text-[10px]">%</span></p></div></div><div className="mt-4 h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={performanceMetrics.data.daily} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2ebe1" /><XAxis dataKey="date" tick={{ fontSize: 9, fill: "#718071" }} tickFormatter={value => String(value).slice(5)} /><YAxis allowDecimals={false} tick={{ fontSize: 9, fill: "#718071" }} /><Tooltip labelFormatter={value => `날짜 ${value}`} /><Line type="monotone" dataKey="matched" name="API 정확 SKU" stroke="#176b3a" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="collectorResolved" name="수집기 해소" stroke="#94601a" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="unresolved" name="미해결" stroke="#a44c45" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#718071]"><span>시도 {performanceMetrics.data.summary.attempts}건</span><span>고유 상품 {performanceMetrics.data.summary.uniqueProducts}개</span><span>정확 매칭 {performanceMetrics.data.summary.matched}건</span><span>미해결 시도 {performanceMetrics.data.summary.unresolved}건</span><span className="font-bold text-[#a44c45]">고유 미해결 {performanceMetrics.data.summary.unresolvedProducts}개</span><span>API 오류 {performanceMetrics.data.summary.apiErrors}건</span><span>보호 모드 {performanceMetrics.data.summary.rateLimited}건</span></div><div className="mt-3 rounded-2xl bg-[#fffaf0] px-3 py-2 text-[10px] leading-4 text-[#94601a]"><span className="font-bold">원인별 시도:</span> SKU 미일치 {performanceMetrics.data.summary.failureReasonCounts.skuMismatch}건 · 수집기 해소 {performanceMetrics.data.summary.failureReasonCounts.collectorTrusted}건 · API 오류 {performanceMetrics.data.summary.failureReasonCounts.apiError}건 · 보호 모드 {performanceMetrics.data.summary.failureReasonCounts.rateLimited}건</div></> : null}</section>
    <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-[#e2ebe1]">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#308154]">LAST 24 HOURS</p><h2 className="mt-1 text-lg font-extrabold text-[#25362a]">가격 갱신 작업 통계</h2><p className="mt-1 text-[11px] leading-4 text-[#718071]">최근 24시간의 실행 결과와 시간대별 처리 상품 수를 보여줍니다.</p></div><button type="button" onClick={() => priceRefreshStats.refetch()} className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f4fbf5] text-[#176b3a]" aria-label="가격 갱신 통계 새로고침"><RefreshCw className={`size-4 ${priceRefreshStats.isFetching ? "animate-spin" : ""}`} /></button></div>
      {priceRefreshStats.isLoading ? <p className="py-10 text-center text-xs text-[#718071]">가격 갱신 통계를 계산하는 중입니다.</p> : null}
      {priceRefreshStats.data ? <>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-2xl bg-[#f4fbf5] p-3"><Activity className="size-4 text-[#176b3a]" /><p className="mt-2 text-[10px] font-bold text-[#718071]">전체 실행</p><p className="mt-1 text-xl font-extrabold text-[#25362a]">{priceRefreshStats.data.summary.totalRuns}<span className="ml-1 text-[10px] font-bold text-[#718071]">회</span></p></div>
          <div className="rounded-2xl bg-[#f4fbf5] p-3"><TrendingUp className="size-4 text-[#176b3a]" /><p className="mt-2 text-[10px] font-bold text-[#718071]">성공률</p><p className="mt-1 text-xl font-extrabold text-[#176b3a]">{priceRefreshStats.data.summary.successRate}<span className="ml-1 text-[10px]">%</span></p></div>
          <div className="rounded-2xl bg-[#f7faf7] p-3"><p className="text-[10px] font-bold text-[#718071]">처리 상품</p><p className="mt-2 text-xl font-extrabold text-[#25362a]">{priceRefreshStats.data.summary.processedCount}<span className="ml-1 text-[10px] font-bold text-[#718071]">개</span></p><p className="mt-1 text-[9px] text-[#718071]">성공 {priceRefreshStats.data.summary.successfulRuns} · 실패 {priceRefreshStats.data.summary.failedRuns}</p></div>
          <button type="button" onClick={() => setShowFailedPriceRuns(previous => !previous)} disabled={priceRefreshStats.data.summary.failedRuns === 0} aria-expanded={showFailedPriceRuns} className="rounded-2xl bg-[#fff8f7] p-3 text-left disabled:opacity-60"><p className="text-[10px] font-bold text-[#a44c45]">실패 작업 · 상세 보기</p><p className="mt-2 text-xl font-extrabold text-[#a44c45]">{priceRefreshStats.data.summary.failedRuns}<span className="ml-1 text-[10px]">회</span></p><p className="mt-1 text-[9px] text-[#718071]">{priceRefreshStats.data.summary.failedRuns > 0 ? (showFailedPriceRuns ? "상세 닫기" : "눌러서 오류 보기") : `진행 중 ${priceRefreshStats.data.summary.runningRuns}회`}</p></button>
        </div>
        {showFailedPriceRuns ? <section className="mt-4 rounded-2xl border border-[#edc8c3] bg-[#fffafa] p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-extrabold text-[#a44c45]">실패한 가격 갱신 작업</p><p className="mt-1 text-[10px] text-[#718071]">최근 24시간 내 실패 실행의 처리 결과와 오류 사유입니다.</p></div><button type="button" onClick={() => failedPriceRuns.refetch()} className="grid size-8 place-items-center rounded-full bg-white text-[#a44c45] ring-1 ring-[#edc8c3]" aria-label="실패 작업 목록 새로고침"><RefreshCw className={`size-3.5 ${failedPriceRuns.isFetching ? "animate-spin" : ""}`} /></button></div>{failedPriceRuns.isLoading ? <p className="py-5 text-center text-xs text-[#718071]">실패 작업을 불러오는 중입니다.</p> : null}{!failedPriceRuns.isLoading && (failedPriceRuns.data?.length ?? 0) === 0 ? <p className="mt-3 rounded-xl bg-white p-3 text-center text-[11px] text-[#718071]">최근 24시간 내 실패 작업이 없습니다.</p> : null}{failedPriceRuns.data?.map(run => <article key={run.id} className="mt-3 rounded-xl bg-white p-3 ring-1 ring-[#f1d7d3]"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-extrabold text-[#25362a]">실행 {formatDate(run.startedAt)}</p><p className="mt-1 text-[10px] text-[#718071]">{run.finishedAt ? `종료 ${formatDate(run.finishedAt)}` : "종료 시각 미기록"} · 처리 상품 {run.processedCount}개</p></div><span className="rounded-full bg-[#fff0ee] px-2 py-1 text-[9px] font-bold text-[#a44c45]">실패</span></div><p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-[#fff8f7] p-2 text-[10px] leading-4 text-[#86423c]">{run.detail || "저장된 오류 사유가 없습니다."}</p></article>)}</section> : null}
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#e3ece4] p-3"><p className="mb-2 text-[11px] font-extrabold text-[#25362a]">시간대별 처리 상품</p><div className="h-48 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={refreshChartData} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5ece5" /><XAxis dataKey="time" interval={5} tick={{ fontSize: 9, fill: "#718071" }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 9, fill: "#718071" }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="processedCount" name="처리 상품" fill="#2f9460" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
          <div className="rounded-2xl border border-[#e3ece4] p-3"><p className="mb-2 text-[11px] font-extrabold text-[#25362a]">시간대별 성공률</p><div className="h-48 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={refreshChartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5ece5" /><XAxis dataKey="time" interval={5} tick={{ fontSize: 9, fill: "#718071" }} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#718071" }} axisLine={false} tickLine={false} /><Tooltip /><Line type="monotone" dataKey="successRate" name="성공률(%)" stroke="#477fbd" strokeWidth={2.5} dot={false} connectNulls /></LineChart></ResponsiveContainer></div></div>
        </div>
      </> : null}
    </section>
    <section className="mb-4 rounded-3xl bg-[#176b3a] p-4 text-white shadow-[0_12px_30px_rgba(23,107,58,.2)]"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/15"><Gem className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-xs font-extrabold">GoldBox 즉시 갱신</p><p className="mt-1 text-[10px] leading-4 text-[#d9f0dd]">필요할 때만 쿠팡 공식 GoldBox 상품을 바로 갱신합니다. 기존 API 보호·분당 호출 제한이 그대로 적용됩니다.</p><p className="mt-1.5 text-[10px] font-bold text-[#d9f0dd]">{goldBoxSyncStatus.data?.finishedAt ? `최근 갱신 ${formatDate(goldBoxSyncStatus.data.finishedAt)} · ${goldBoxSyncStatus.data.detail ?? `${goldBoxSyncStatus.data.processedCount}개 처리`}` : "아직 GoldBox 갱신 기록이 없습니다."}</p></div></div><button type="button" onClick={() => refreshGoldBox.mutate()} disabled={refreshGoldBox.isPending} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-extrabold text-[#176b3a] disabled:opacity-60"><RefreshCw className={`size-3.5 ${refreshGoldBox.isPending ? "animate-spin" : ""}`} />{refreshGoldBox.isPending ? "GoldBox 갱신 중" : "GoldBox 지금 갱신"}</button></section>
    <section className="mb-4 rounded-3xl bg-[#176b3a] p-4 text-white shadow-[0_12px_30px_rgba(23,107,58,.2)]"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/15"><RefreshCw className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-xs font-extrabold">가신 수집 데이터 동기화</p><p className="mt-1 text-[10px] leading-4 text-[#d9f0dd]">수집기가 보낸 최신 가격을 옵션 SKU가 일치하는 상품에 반영합니다. 외부 수집 이력은 90일 후 자동 정리됩니다.</p><p className="mt-1 text-[10px] leading-4 text-[#d9f0dd]">옵션이 비어 있는 상품은 아래 버튼으로 최근 수집 관측의 용량·수량·포장 정보를 한 번에 보완할 수 있습니다.</p><p className="mt-1.5 text-[10px] font-bold text-[#d9f0dd]">{collectorSyncStatus.data?.finishedAt ? `최근 동기화 ${formatDate(collectorSyncStatus.data.finishedAt)} · ${collectorSyncStatus.data.detail ?? `${collectorSyncStatus.data.processedCount}개 반영`}` : "아직 수집 데이터 동기화 기록이 없습니다."}</p></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => collectorSync.mutate()} disabled={collectorSync.isPending || collectorMetadataSync.isPending} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-extrabold text-[#176b3a] disabled:opacity-60"><RefreshCw className={`size-3.5 ${collectorSync.isPending ? "animate-spin" : ""}`} />{collectorSync.isPending ? "수집 데이터 반영 중" : "가격·수집 데이터 동기화"}</button><button type="button" onClick={() => collectorMetadataSync.mutate()} disabled={collectorSync.isPending || collectorMetadataSync.isPending} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/60 bg-white/15 px-4 text-xs font-extrabold text-white disabled:opacity-60"><RefreshCw className={`size-3.5 ${collectorMetadataSync.isPending ? "animate-spin" : ""}`} />{collectorMetadataSync.isPending ? "옵션 보완 중" : "옵션 메타 일괄 보완"}</button></div></section>
    <section className="mb-6 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-[#e2ebe1]"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#308154]">CURRENT PRICE TREND</p><h2 className="mt-1 text-lg font-extrabold">현재 가격 추이 상품</h2><p className="mt-1 text-[11px] leading-4 text-[#718071]">상품명·쿠팡 SKU·옵션으로 검색하고, 확인 가격 입력·품절·삭제·쿠팡 바로가기를 관리합니다. 1페이지에 10개씩 표시합니다.</p></div><button type="button" onClick={() => currentPriceProducts.refetch()} className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f4fbf5] text-[#176b3a]" aria-label="현재 가격 추이 새로고침"><RefreshCw className={`size-4 ${currentPriceProducts.isFetching ? "animate-spin" : ""}`} /></button></div><div className="mt-3 flex items-center gap-2 rounded-xl border border-[#d9e6d9] bg-[#fbfdfb] px-3"><Search className="size-4 shrink-0 text-[#6d8975]" /><input value={currentPriceQuery} onChange={event => setCurrentPriceQuery(event.target.value)} placeholder="상품명, 쿠팡 SKU, 옵션·용량·수량 검색" className="min-w-0 flex-1 bg-transparent py-3 text-xs outline-none placeholder:text-[#9aaa9d]" />{currentPriceQuery ? <button type="button" onClick={() => setCurrentPriceQuery("")} className="grid size-7 place-items-center rounded-full text-[#6d8975] hover:bg-[#eaf6ec]" aria-label="현재 가격 추이 검색어 지우기"><X className="size-3.5" /></button> : null}</div><div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" aria-pressed={showOnlyMissingOption} onClick={() => { setShowOnlyMissingOption(previous => !previous); setCurrentPricePage(1); setSelectedCurrentPriceIds(new Set()); }} className={`min-h-9 rounded-xl px-3 text-[10px] font-bold ring-1 ${showOnlyMissingOption ? "bg-[#94601a] text-white ring-[#94601a]" : "bg-[#fffaf0] text-[#94601a] ring-[#ecd09f]"}`}>{showOnlyMissingOption ? "옵션 미확인 전체 보기" : `옵션 미확인 ${missingOptionCount}개`}</button>{showOnlyMissingOption ? <span className="text-[10px] text-[#94601a]">옵션·용량·수량·포장 정보가 모두 없는 상품만 표시합니다.</span> : null}</div><div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f4fbf5] px-3 py-2"><label className="inline-flex min-h-8 cursor-pointer items-center gap-2 text-[10px] font-bold text-[#45634d]"><input type="checkbox" checked={allCurrentPricePageSelected} onChange={() => setSelectedCurrentPriceIds(previous => { const next = new Set(previous); if (allCurrentPricePageSelected) currentPricePageIds.forEach(productId => next.delete(productId)); else currentPricePageIds.forEach(productId => next.add(productId)); return next; })} className="size-4 accent-[#176b3a]" />현재 페이지 전체 선택</label><span className="text-[10px] text-[#718071]">검색 결과 {currentPriceFiltered.length}개 · 선택 {selectedCurrentPriceIds.size}개</span>{selectedCurrentPriceIds.size > 0 ? <button type="button" onClick={deleteSelectedCurrentProducts} disabled={deleteCurrentPriceProducts.isPending} className="min-h-8 rounded-xl bg-[#a44c45] px-3 text-[10px] font-bold text-white disabled:opacity-50">{deleteCurrentPriceProducts.isPending ? "삭제 중" : `선택 상품 ${selectedCurrentPriceIds.size}개 삭제`}</button> : null}</div>{currentPriceProducts.isLoading ? <p className="py-8 text-center text-xs text-[#718071]">가격 추이 상품을 불러오는 중입니다.</p> : null}{!currentPriceProducts.isLoading && currentPriceFiltered.length === 0 ? <p className="mt-3 rounded-2xl bg-[#f4f7f3] p-4 text-center text-xs text-[#718071]">검색 조건에 맞는 가격 추이 상품이 없습니다.</p> : null}<div className="mt-3 space-y-3">{currentPricePageItems.map(product => { const [coupangProductId, storedItemId, storedVendorItemId] = product.externalProductId.split(":"); const coupangUrl = coupangProductId ? createCoupangProductUrl(coupangProductId, storedItemId, storedVendorItemId) : null; const displayName = getProductDisplayName(product.name, product.variantLabel, product.unitLabel); const currentOptionDraft = optionDrafts[product.id] ?? createOptionDraft(product.variantLabel, product.unitLabel); const isEditingCurrentOption = editingOptionIds.has(product.id); return <article key={product.id} className="rounded-2xl border border-[#e3ece4] bg-[#fbfdfb] p-3"><label className="mb-2 inline-flex min-h-8 cursor-pointer items-center gap-2 text-[10px] font-bold text-[#45634d]"><input type="checkbox" checked={selectedCurrentPriceIds.has(product.id)} onChange={() => setSelectedCurrentPriceIds(previous => { const next = new Set(previous); if (next.has(product.id)) next.delete(product.id); else next.add(product.id); return next; })} className="size-4 accent-[#176b3a]" />이 상품 선택</label><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="text-xs font-extrabold text-[#25362a]">{displayName}</h3><p className="mt-1 text-[10px] text-[#607765]">현재 옵션·용량·수량: <strong>{product.variantLabel || "미등록"}</strong>{product.quantity ? ` · 수량 ${product.quantity}개` : ""}</p></div><button type="button" onClick={() => { setEditingOptionIds(previous => { const next = new Set(previous); next.add(product.id); return next; }); setOptionDrafts(previous => ({ ...previous, [product.id]: currentOptionDraft })); }} className="min-h-8 shrink-0 rounded-xl border border-[#b9d8c0] bg-white px-2.5 text-[10px] font-bold text-[#176b3a]">{isEditingCurrentOption ? "수정 중" : "옵션 수정"}</button></div><p className="mt-1 text-[10px] text-[#718071]">현재가 {won(product.currentPrice)} · 최저가 {won(product.lowestPrice)}</p><p className="mt-1 text-[10px] text-[#829184]">마지막 확인 {formatDate(product.lastSeenAt)} · SKU {product.externalProductId}</p></div>{product.inStock === false ? <span className="shrink-0 rounded-full bg-[#f0f2f0] px-2 py-1 text-[10px] font-bold text-[#646b66]">품절</span> : null}</div>{isEditingCurrentOption ? <div className="mt-3 rounded-2xl bg-[#fffaf0] p-3"><p className="text-[10px] font-bold text-[#94601a]">현재 옵션·용량·수량 수정</p><p className="mt-1 text-[10px] leading-4 text-[#876f44]">가격과 SKU는 변경하지 않고 현재 구성 정보만 수정합니다.</p><div className="mt-2 grid gap-2 sm:grid-cols-3"><input value={currentOptionDraft.option} onChange={event => updateDraft(product.id, "option", event.target.value)} placeholder="옵션명" className="rounded-xl border border-[#eadfbd] bg-white px-3 py-2.5 text-xs outline-none focus:border-[#a36c12]" /><input value={currentOptionDraft.capacity} onChange={event => updateDraft(product.id, "capacity", event.target.value)} placeholder="용량 예: 80ml" className="rounded-xl border border-[#eadfbd] bg-white px-3 py-2.5 text-xs outline-none focus:border-[#a36c12]" /><input inputMode="numeric" value={currentOptionDraft.quantity} onChange={event => updateDraft(product.id, "quantity", event.target.value.replace(/[^0-9]/g, ""))} placeholder="수량 예: 2" className="rounded-xl border border-[#eadfbd] bg-white px-3 py-2.5 text-xs outline-none focus:border-[#a36c12]" /></div><button type="button" onClick={() => saveCombinedProduct(product.id)} disabled={updateOptions.isPending} className="mt-2 min-h-9 w-full rounded-xl bg-[#176b3a] px-3 text-[10px] font-bold text-white disabled:opacity-50">{updateOptions.isPending ? "저장 중" : "옵션 정보 저장"}</button></div> : null}<div className="mt-3 flex flex-wrap gap-2"><input inputMode="numeric" value={drafts[product.id] ?? ""} onChange={event => setDrafts(previous => ({ ...previous, [product.id]: event.target.value }))} placeholder="확인 가격(원)" className="min-h-9 min-w-0 flex-1 rounded-xl border border-[#d9e6d9] bg-white px-3 text-xs outline-none focus:border-[#6d9ec7]" /><button type="button" onClick={() => savePrice(product.id)} disabled={save.isPending} className="min-h-9 rounded-xl bg-[#176b3a] px-3 text-[10px] font-bold text-white disabled:opacity-50">저장</button>{coupangUrl ? <a href={coupangUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-[#b9d8c0] bg-white px-3 text-[10px] font-bold text-[#176b3a]"><ExternalLink className="size-3" />쿠팡 바로가기</a> : null}<button type="button" onClick={() => markCurrentProductSoldOut(product.id, product.name)} disabled={markCurrentPriceProductSoldOut.isPending || product.inStock === false} className="min-h-9 rounded-xl border border-[#ecd09f] bg-[#fffaf0] px-3 text-[10px] font-bold text-[#94601a] disabled:opacity-50">품절</button><button type="button" onClick={() => deleteCurrentProduct(product.id, product.name)} disabled={deleteCurrentPriceProduct.isPending} className="min-h-9 rounded-xl border border-[#edc8c3] bg-[#fff8f7] px-3 text-[10px] font-bold text-[#a44c45] disabled:opacity-50">삭제</button></div></article>; })}</div><PageControls page={currentPricePage} total={currentPriceFiltered.length} onChange={setCurrentPricePage} label="현재 가격 추이" /></section>
    <header className="mb-5 rounded-3xl bg-[#176b3a] p-5 text-white shadow-[0_12px_30px_rgba(23,107,58,.2)]"><div className="flex items-center gap-2"><ShieldCheck className="size-5" /><p className="text-xs font-bold tracking-wide text-[#d9f0dd]">ADMIN ONLY</p></div><h1 className="mt-2 text-xl font-extrabold tracking-[-0.05em]">가격 확인 관리</h1><p className="mt-2 text-xs leading-5 text-[#d9f0dd]">쿠팡 링크를 열어 직접 확인한 금액과 누락된 옵션 정보를 관리자만 입력할 수 있습니다.</p><div className="mt-3 flex flex-wrap gap-2"><Link href="/admin/hot-deals" className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-white/95 px-4 text-xs font-bold text-[#176b3a]">스마트스토어 특가 관리 <span aria-hidden="true">→</span></Link><Link href="/admin/members" className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-white/95 px-4 text-xs font-bold text-[#176b3a]">회원 관리 <span aria-hidden="true">→</span></Link></div></header>

    <section className="mb-6 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-[#e2ebe1]"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#308154]">DUPLICATE REVIEW</p><h2 className="mt-1 text-lg font-extrabold">중복 상품 후보</h2><p className="mt-1 text-[11px] leading-4 text-[#718071]">같은 상품 페이지에서 상품명·용량·수량·포장·가격이 모두 일치하는 레거시 상품과 정확 옵션 SKU를 비교합니다. 조건이 다르면 병합 후보로 제시하지 않습니다.</p></div><button type="button" onClick={() => duplicateCandidates.refetch()} className="grid size-10 place-items-center rounded-full bg-[#f4fbf5] text-[#176b3a]" aria-label="중복 후보 새로고침"><RefreshCw className="size-4" /></button></div>{duplicateCandidates.isLoading ? <p className="mt-4 text-center text-xs text-[#718071]">중복 후보를 확인하는 중입니다.</p> : null}{!duplicateCandidates.isLoading && (duplicateCandidates.data?.length ?? 0) === 0 ? <p className="mt-4 rounded-2xl bg-[#f4f7f3] p-4 text-center text-xs text-[#718071]">현재 안전하게 병합할 중복 후보가 없습니다.</p> : null}{duplicateCandidates.data?.length ? <div className="mt-4 space-y-3">{duplicateCandidates.data.map(candidate => { const selected = selectedMerge?.sourceProductId === candidate.source.id && selectedMerge.targetProductId === candidate.target.id; return <article key={`${candidate.source.id}-${candidate.target.id}`} className={`rounded-2xl border p-3 ${selected ? "border-[#65a878] bg-[#f4fbf5]" : "border-[#e3ece4] bg-[#fbfdfb]"}`}><div className="grid grid-cols-2 gap-2"><div className="min-w-0 rounded-xl bg-[#fff7f6] p-2.5"><p className="text-[9px] font-bold text-[#a44c45]">병합 원본 · 레거시</p><p className="mt-1 line-clamp-2 text-xs font-extrabold text-[#25362a]">{candidate.source.name}</p><p className="mt-1 text-[10px] text-[#718071]">{candidate.source.variantLabel ?? "옵션 미확인"}{candidate.source.quantity ? ` · 수량 ${candidate.source.quantity}개` : ""}{candidate.source.packSize ? ` · 포장 ${candidate.source.packSize}` : ""} · {won(candidate.source.currentPrice)}</p><p className="mt-1 truncate text-[9px] text-[#a44c45]">SKU {candidate.source.externalProductId}</p></div><div className="min-w-0 rounded-xl bg-[#f0f8f1] p-2.5"><p className="text-[9px] font-bold text-[#176b3a]">유지 상품 · 정확 SKU</p><p className="mt-1 line-clamp-2 text-xs font-extrabold text-[#25362a]">{candidate.target.name}</p><p className="mt-1 text-[10px] text-[#718071]">{candidate.target.variantLabel ?? "옵션 미확인"}{candidate.target.quantity ? ` · 수량 ${candidate.target.quantity}개` : ""}{candidate.target.packSize ? ` · 포장 ${candidate.target.packSize}` : ""} · {won(candidate.target.currentPrice)}</p><p className="mt-1 truncate text-[9px] text-[#176b3a]">SKU {candidate.target.externalProductId}</p></div></div><button type="button" onClick={() => setSelectedMerge({ sourceProductId: candidate.source.id, targetProductId: candidate.target.id })} className={`mt-3 min-h-9 w-full rounded-xl px-3 text-[10px] font-bold ${selected ? "bg-[#176b3a] text-white" : "border border-[#bfdbbf] bg-white text-[#176b3a]"}`}>{selected ? "병합 미리보기 열림" : "병합 미리보기"}</button></article>; })}</div> : null}{selectedMerge ? <div className="mt-4 rounded-2xl border border-[#b8d9bd] bg-[#f4fbf5] p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold text-[#176b3a]">병합 미리보기</p><p className="mt-1 text-xs font-extrabold text-[#25362a]">{mergePreview.data ? `${mergePreview.data.source.name} → 정확 옵션 SKU` : "참조 데이터를 계산하는 중입니다."}</p></div><button type="button" onClick={() => setSelectedMerge(null)} className="text-[10px] font-bold text-[#607765]">닫기</button></div>{mergePreview.data ? <><div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><p className="rounded-xl bg-white p-2 text-[#536d58]">가격 이력 이관 <strong className="text-[#176b3a]">{mergePreview.data.counts.priceHistoryToMove}건</strong></p><p className="rounded-xl bg-white p-2 text-[#536d58]">중복 이력 정리 <strong className="text-[#176b3a]">{mergePreview.data.counts.duplicatePriceHistoryToRemove}건</strong></p><p className="rounded-xl bg-white p-2 text-[#536d58]">확인 가격 이관 <strong className="text-[#176b3a]">{mergePreview.data.counts.userConfirmedPricesToMove}건</strong></p><p className="rounded-xl bg-white p-2 text-[#536d58]">찜 설정 이관·결합 <strong className="text-[#176b3a]">{mergePreview.data.counts.favoritesToMove + mergePreview.data.counts.favoriteSettingsToCombine}건</strong></p></div><p className="mt-2 text-[10px] leading-4 text-[#648168]">원본 상품은 삭제하지 않고 비활성화합니다. 가격 이력·확인 가격·찜·알림·카테고리·수동 링크 참조는 유지 상품으로 이관됩니다.</p><button type="button" onClick={confirmDuplicateMerge} disabled={mergeDuplicates.isPending} className="mt-3 min-h-10 w-full rounded-xl bg-[#176b3a] px-3 text-xs font-extrabold text-white disabled:opacity-60">{mergeDuplicates.isPending ? "병합 처리 중" : "이 내용으로 수동 병합"}</button></> : null}</div> : null}</section>

    <section className="mb-6 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-[#e2ebe1]"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#308154]">SEARCH INSIGHTS</p><h2 className="mt-1 text-lg font-extrabold">검색 실패 이력</h2><p className="mt-1 text-[11px] leading-4 text-[#718071]">정상 상품·옵션 설명이 너무 길어 생긴 실패는 저장 상품 기준으로 자동 정리합니다. 외부 쿠팡 API는 호출하지 않습니다.</p></div><button type="button" onClick={() => missingSearches.refetch()} className="grid size-10 place-items-center rounded-full bg-[#f4fbf5] text-[#176b3a]" aria-label="검색 실패 이력 새로고침"><RefreshCw className="size-4" /></button></div><div className="mt-4 grid gap-2 sm:grid-cols-4"><button type="button" onClick={() => mergeDuplicateMissingSearches.mutate()} disabled={mergeDuplicateMissingSearches.isPending} className="flex min-h-11 items-center justify-between rounded-2xl border border-[#b9d8c0] bg-[#176b3a] px-3 text-xs font-bold text-white disabled:opacity-60"><span>{mergeDuplicateMissingSearches.isPending ? "중복 통합 중" : "중복 검색어 통합"}</span><RefreshCw className={`size-3.5 ${mergeDuplicateMissingSearches.isPending ? "animate-spin" : ""}`} /></button><button type="button" onClick={() => pruneResolvedMissingSearches.mutate()} disabled={pruneResolvedMissingSearches.isPending} className="flex min-h-11 items-center justify-between rounded-2xl border border-[#b9d8c0] bg-[#176b3a] px-3 text-xs font-bold text-white disabled:opacity-60"><span>{pruneResolvedMissingSearches.isPending ? "자동 정리 중" : "저장 상품 기준 자동 정리"}</span><RefreshCw className={`size-3.5 ${pruneResolvedMissingSearches.isPending ? "animate-spin" : ""}`} /></button><Link href="/admin/searches" className="flex min-h-11 items-center justify-between rounded-2xl border border-[#cfe3d2] bg-[#f4fbf5] px-3 text-xs font-bold text-[#176b3a]"><span>전체 사용자 검색 기록 보기</span><span aria-hidden="true">→</span></Link><Link href="/admin/product-requests" className="flex min-h-11 items-center justify-between rounded-2xl border border-[#cfe3d2] bg-[#f4fbf5] px-3 text-xs font-bold text-[#176b3a]"><span>사용자 상품 추가 요청 보기</span><span aria-hidden="true">→</span></Link></div>{missingSearches.data?.length ? <><div className="mt-3 divide-y divide-[#edf1ed] border-t border-[#edf1ed]">{missingSearchPageItems.map(item => <div key={item.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-xs font-bold text-[#25362a]">{item.keyword}</p><p className="mt-1 text-[10px] text-[#829184]">{item.searchCount}회 · 최근 {formatDate(item.lastSearchedAt)}</p><div className="mt-1.5 flex flex-wrap items-center gap-1.5"><span className="rounded-full bg-[#e8f4ea] px-2 py-0.5 text-[9px] font-bold text-[#176b3a]">{item.label}</span>{item.optionSummary ? <span className="rounded-full bg-[#f4f7f3] px-2 py-0.5 text-[9px] font-semibold text-[#718071]">옵션 {item.optionSummary}</span> : null}</div><p className="mt-1 text-[10px] leading-4 text-[#718071]">{item.reason}</p></div><div className="flex shrink-0 items-center gap-1.5"><button type="button" onClick={() => registerMissingSearchCandidate(item.id, item.keyword)} disabled={addMissingSearchCandidate.isPending || registeredMissingSearchIds.has(item.id)} className="inline-flex min-h-8 items-center gap-1 rounded-xl bg-[#176b3a] px-2.5 text-[10px] font-bold text-white disabled:opacity-60">{registeredMissingSearchIds.has(item.id) ? "등록됨" : <><Plus className="size-3" />후보 등록</>}</button><button type="button" onClick={() => deleteMissingSearchItem(item.id, item.keyword)} disabled={deleteMissingSearch.isPending} className="inline-flex min-h-8 items-center gap-1 rounded-xl border border-[#e7c7c2] bg-[#fff7f6] px-2.5 text-[10px] font-bold text-[#a44c45] disabled:opacity-60"><Trash2 className="size-3" />삭제</button></div></div>)}</div><PageControls page={missingSearchPage} total={missingSearches.data?.length ?? 0} onChange={setMissingSearchPage} label="검색 실패 이력" /></> : <p className="mt-4 rounded-2xl bg-[#f4f7f3] p-4 text-center text-xs text-[#718071]">아직 검색 실패 이력이 없습니다.</p>}</section>


    <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-[#308154]">{showOnlyUnmatchedSku ? "SKU RETRY QUEUE" : showOnlySoldOut ? "SOLD OUT" : showOnlyMissingImage ? "IMAGE STATUS" : "DEFERRED PRODUCTS"}</p><h2 className="mt-1 text-lg font-extrabold">{showOnlyUnmatchedSku ? "SKU 재처리 대기열" : showOnlySoldOut ? "품절 상품 관리" : showOnlyMissingImage ? "이미지 없는 상품 관리" : "보류 상품 가격 입력"}</h2>{!showOnlySoldOut && !showOnlyMissingImage ? <div className="mt-1 space-y-1 text-[10px] leading-4 text-[#718071]"><p>전체 보류 {deferredSummary.data?.totalDeferred ?? "-"}개 · <strong className="text-[#a44c45]">수동 가격 입력 필요 {deferredSummary.data?.manualInputRequired ?? "-"}개</strong> · 최근 확인 {deferredSummary.data?.recentlyConfirmed ?? "-"}개</p><p><strong className="text-[#3567a8]">자동 재확인 대상</strong> 지금 처리 {deferredSummary.data?.cronRecheck?.dueNow ?? "-"}개 · 예약 {deferredSummary.data?.cronRecheck?.scheduledLater ?? "-"}개 · 수집기 확인 대기 {deferredSummary.data?.cronRecheck?.awaitingCollection ?? "-"}개 · 제외 {deferredSummary.data?.cronRecheck?.excludedTotal ?? "-"}개</p><p className="text-[#8a968b]">외부 자동 실행은 검색 등록·활성·재고 보유 상품을 최대 10개씩 처리합니다. 정확 SKU 미일치는 수집기 관측 대기로 전환됩니다. 목록은 최근 500개까지만 표시합니다.</p></div> : null}</div><div className="flex flex-wrap items-center justify-end gap-2"><button type="button" onClick={() => { setShowOnlySoldOut(previous => !previous); setShowOnlyMissingImage(false); setShowOnlyNeedsConfirmation(false); setIncludeAutomaticDeferred(false); }} aria-pressed={showOnlySoldOut} className={`min-h-10 rounded-xl px-3 text-[11px] font-bold shadow-sm ring-1 ${showOnlySoldOut ? "bg-[#646b66] text-white ring-[#646b66]" : "bg-white text-[#646b66] ring-[#ccd4cd]"}`}>{showOnlySoldOut ? "보류 상품 보기" : "품절만"}</button><button type="button" onClick={() => { setShowOnlyMissingImage(previous => !previous); setShowOnlySoldOut(false); setIncludeAutomaticDeferred(false); }} aria-pressed={showOnlyMissingImage} className={`min-h-10 rounded-xl px-3 text-[11px] font-bold shadow-sm ring-1 ${showOnlyMissingImage ? "bg-[#a44c45] text-white ring-[#a44c45]" : "bg-white text-[#a44c45] ring-[#e7c7c2]"}`}>{showOnlyMissingImage ? "보류 상품 보기" : "이미지 없음만"}</button><button type="button" onClick={() => { setIncludeAutomaticDeferred(previous => !previous); setShowOnlySoldOut(false); setShowOnlyMissingImage(false); setShowOnlyNeedsConfirmation(false); }} aria-pressed={includeAutomaticDeferred} className={`min-h-10 rounded-xl px-3 text-[11px] font-bold shadow-sm ring-1 ${includeAutomaticDeferred ? "bg-[#3567a8] text-white ring-[#3567a8]" : "bg-white text-[#3567a8] ring-[#cbdcf2]"}`}>{includeAutomaticDeferred ? "입력 필요만" : `자동 대기 ${deferredSummary.data?.automaticRecheck ?? 0}`}</button><button type="button" onClick={() => setShowOnlyNeedsConfirmation(previous => !previous)} disabled={showOnlySoldOut || includeAutomaticDeferred} aria-pressed={showOnlyNeedsConfirmation} className={`min-h-10 rounded-xl px-3 text-[11px] font-bold shadow-sm ring-1 disabled:opacity-40 ${showOnlyNeedsConfirmation ? "bg-[#94601a] text-white ring-[#94601a]" : "bg-white text-[#94601a] ring-[#ecd09f]"}`}>{showOnlyNeedsConfirmation ? "전체 보기" : "확인 필요만"}</button><button type="button" onClick={() => { deferred.refetch(); deferredSummary.refetch(); }} className="grid size-10 place-items-center rounded-full bg-white text-[#176b3a] shadow-sm ring-1 ring-[#e2ebe1]" aria-label="목록 새로고침"><RefreshCw className="size-4" /></button></div></div>
    <div className="mb-4 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-[#e2ebe1]"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><label htmlFor="admin-product-search" className="block text-[11px] font-bold text-[#607765]">제품별 검색</label><button type="button" onClick={() => { setShowOnlyUnmatchedSku(previous => !previous); setShowOnlySoldOut(false); setShowOnlyMissingImage(false); setShowOnlyNeedsConfirmation(false); setIncludeAutomaticDeferred(false); }} aria-pressed={showOnlyUnmatchedSku} className={`min-h-9 rounded-xl px-3 text-[10px] font-bold ring-1 ${showOnlyUnmatchedSku ? "bg-[#8a5f29] text-white ring-[#8a5f29]" : "bg-[#fff8ef] text-[#8a5f29] ring-[#ead5b7]"}`}>{showOnlyUnmatchedSku ? "전체 보류 보기" : "SKU 재처리 대기열"}</button></div><div className="flex items-center gap-2 rounded-xl border border-[#d9e6d9] bg-[#fbfdfb] px-3 focus-within:border-[#6d9ec7]"><Search className="size-4 shrink-0 text-[#6d8975]" /><input id="admin-product-search" value={productQuery} onChange={event => setProductQuery(event.target.value)} placeholder="상품명, 쿠팡 SKU, 옵션·용량·수량 검색" className="min-w-0 flex-1 bg-transparent py-3 text-xs outline-none placeholder:text-[#9aaa9d]" />{productQuery ? <button type="button" onClick={() => setProductQuery("")} className="grid size-7 shrink-0 place-items-center rounded-full text-[#6d8975] hover:bg-[#eaf6ec]" aria-label="제품 검색어 지우기"><X className="size-3.5" /></button> : null}</div>{productQuery ? <p className="mt-2 text-[10px] text-[#718071]">검색 결과 {filteredProducts.length}개</p> : null}{showOnlyUnmatchedSku ? <p className="mt-2 text-[10px] leading-4 text-[#8a5f29]">공식 검색 결과에서 현재 상품의 productId·itemId·vendorItemId 조합을 찾지 못한 상품만 모은 재처리 대기열입니다. 수집기 재확인 등록과 쿠팡 바로가기를 이 목록에서 우선 처리하세요.</p> : null}</div>
    {!showOnlySoldOut && !showOnlyMissingImage ? <div className="mb-3 flex flex-wrap items-center gap-2"><button type="button" onClick={() => { setShowOnlyAwaitingCollection(previous => !previous); setShowOnlyNeedsConfirmation(false); setIncludeAutomaticDeferred(false); setShowOnlyUnmatchedSku(false); }} aria-pressed={showOnlyAwaitingCollection} className={`min-h-10 rounded-xl px-3 text-[11px] font-bold shadow-sm ring-1 ${showOnlyAwaitingCollection ? "bg-[#8a5f29] text-white ring-[#8a5f29]" : "bg-white text-[#8a5f29] ring-[#ead5b7]"}`}>{showOnlyAwaitingCollection ? "보류 상품 보기" : `수집기 확인 대기 ${deferredSummary.data?.cronRecheck?.awaitingCollection ?? 0}`}</button>{showOnlyAwaitingCollection ? <p className="text-[10px] leading-4 text-[#8a5f29]">같은 productId·itemId·vendorItemId 옵션을 수집기가 다시 관측할 때까지 자동 재확인을 멈춘 상품입니다.</p> : null}</div> : null}
    {deferred.isLoading ? <p className="py-10 text-center text-xs text-[#718071]">상품을 불러오는 중입니다.</p> : null}
    {deferred.data?.length === 0 ? <p className="rounded-2xl bg-white p-5 text-center text-xs text-[#718071] ring-1 ring-[#e2ebe1]">{showOnlySoldOut ? "현재 품절로 기록된 상품이 없습니다." : showOnlyMissingImage ? "이미지가 없는 활성 상품이 없습니다." : "현재 보류된 상품이 없습니다."}</p> : null}
    {deferred.data && deferred.data.length > 0 && filteredProducts.length === 0 ? <p className="rounded-2xl bg-white p-5 text-center text-xs text-[#718071] ring-1 ring-[#e2ebe1]">{showOnlyNeedsConfirmation ? "현재 48시간 확인이 필요한 상품이 없습니다." : "검색 조건에 맞는 제품이 없습니다."}</p> : null}
    {deferredPageItems.map(product => {
      const hasCollectorVerifiedPath = hasCollectorVerifiedPurchasePath(product);
      const needsPurchaseFallback = (product.deepLinkStatus === "failed" || product.refreshState === "awaiting_collection") && !hasCollectorVerifiedPath;
      const link = needsPurchaseFallback ? null : product.deepLinkUrl ?? (hasCollectorVerifiedPath ? product.affiliateUrl : null);
      const canRefreshDeepLink = needsPurchaseFallback || !link;
      const deepLinkRefreshResult = deepLinkRefreshResults[product.id];
      const deepLinkFailure = describeDeepLinkFailure(product.deepLinkFailureReason ?? product.lastRefreshReason);
      const metaTags = getProductMetaTags(product.variantLabel, product.unitLabel);
      const displayName = getProductDisplayName(product.name, product.variantLabel, product.unitLabel);
      const optionDisplayLabel = getProductOptionDisplayLabel(product.variantLabel, product.unitLabel);
      const [coupangProductId, storedItemId, storedVendorItemId] = product.externalProductId.split(":");
      const coupangProductPageUrl = coupangProductId ? createCoupangProductUrl(coupangProductId, storedItemId, storedVendorItemId) : null;
      const collectorConfiguration = [
        optionDisplayLabel ? `옵션 ${optionDisplayLabel}` : null,
        metaTags.capacity ? `용량 ${metaTags.capacity}` : null,
        metaTags.packSize ? `포장 ${metaTags.packSize}` : null,
        metaTags.quantity ? `수량 ${metaTags.quantity}` : null,
      ].filter((value): value is string => Boolean(value));
      const hasMissingOption = missingOptionIds.has(product.id);
      const isEditingOption = editingOptionIds.has(product.id);
      const showOptionEditor = hasMissingOption || isEditingOption;
      const optionDraft = optionDrafts[product.id];
      const hasConfiguration = Boolean(optionDisplayLabel || metaTags.capacity || metaTags.packSize || metaTags.quantity);
      const searchQualifiers = isEditingOption
        ? [optionDraft?.option, optionDraft?.capacity, optionDraft?.quantity ? `${optionDraft.quantity}개` : null]
        : [optionDisplayLabel, metaTags.capacity, metaTags.packSize, metaTags.quantity];
      const coupangSearchUrl = createCoupangSearchUrl(product.name, searchQualifiers);
      const isDeferred = product.refreshState === "deferred";
      const isAwaitingCollection = product.refreshState === "awaiting_collection";
      const canManageDeferredProduct = isDeferred || isAwaitingCollection;
      const isSoldOut = product.inStock === false;
      const confirmation = getAdminConfirmationStatus(product.confirmedPrice?.checkedAt);
      const nextRefreshAt = product.nextRefreshAt ? new Date(product.nextRefreshAt) : null;
      const isRefreshDue = nextRefreshAt ? nextRefreshAt.getTime() <= Date.now() : false;
      return <article key={product.id} className="mt-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#e2ebe1]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h3 className="truncate text-sm font-bold text-[#25362a]">{displayName}</h3>{optionDisplayLabel ? <p className="mt-1 text-[10px] text-[#718071]">{optionDisplayLabel}</p> : null}{metaTags.capacity || metaTags.quantity || metaTags.packSize ? <div className="mt-2 flex flex-wrap gap-1.5">{metaTags.capacity ? <span className="rounded-full bg-[#e7f3e9] px-2 py-1 text-[10px] font-bold text-[#176b3a]">용량 {metaTags.capacity}</span> : null}{metaTags.packSize ? <span className="rounded-full bg-[#fff3df] px-2 py-1 text-[10px] font-bold text-[#9a6415]">포장 {metaTags.packSize}</span> : null}{metaTags.quantity ? <span className="rounded-full bg-[#eef4ff] px-2 py-1 text-[10px] font-bold text-[#3567a8]">수량 {metaTags.quantity}</span> : null}</div> : null}<div data-testid="collector-verification-info" className="mt-2 rounded-xl border border-[#c7e1cc] bg-[#f4fbf5] px-2.5 py-2 text-[10px] leading-4 text-[#426d4d]"><p className="font-extrabold text-[#176b3a]">가신 수집기 확인 정보</p><div className="mt-1 flex flex-wrap items-center gap-1.5"><span>쿠팡 상품 ID {coupangProductPageUrl ? <a data-testid="collector-product-page-link" href={coupangProductPageUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-[#176b3a] underline decoration-[#80ba8c] underline-offset-2 hover:text-[#0f5b2e]" aria-label={`쿠팡 상품 ID ${coupangProductId} 상세 페이지 열기`}>{coupangProductId}</a> : <code className="font-bold text-[#176b3a]">미확인</code>}</span><button type="button" onClick={() => copyCollectorProductId(product.id, coupangProductId)} disabled={!coupangProductId} className="inline-flex min-h-7 items-center gap-1 rounded-lg border border-[#9bcdaa] bg-white px-2 text-[9px] font-extrabold text-[#176b3a] disabled:cursor-not-allowed disabled:opacity-50" aria-label={`쿠팡 상품 ID ${coupangProductId || "미확인"} 복사`}>{copiedCollectorProductId === product.id ? <><Check className="size-3" />복사됨</> : <><Copy className="size-3" />복사</>}</button><a href={coupangProductPageUrl ?? "#"} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-7 items-center gap-1 rounded-lg border border-[#9bcdaa] bg-white px-2 text-[9px] font-extrabold text-[#176b3a] ${coupangProductPageUrl ? "" : "pointer-events-none opacity-50"}`} aria-label={`쿠팡 상품 ID ${coupangProductId || "미확인"} 상세 페이지 열기`}><ExternalLink className="size-3" />쿠팡 상품 바로가기</a></div><p className="mt-1">수집할 구성: <strong>{collectorConfiguration.length ? collectorConfiguration.join(" · ") : "옵션·용량·수량 미등록"}</strong></p><p className="mt-1">현재 저장 옵션 SKU: {storedItemId && storedVendorItemId ? <><code>{storedItemId}</code> · <code>{storedVendorItemId}</code></> : "미확인 — 수집기에서 선택 옵션을 다시 전송해 주세요."}</p></div><p className="mt-2 text-[10px] text-[#9a6a16]">현재가 {won(product.currentPrice)} · 최저가 {won(product.lowestPrice)}{product.confirmedPrice ? ` · 최근 ${won(product.confirmedPrice.price)}` : ""}</p>{product.unitPrice && product.unitLabel ? <p className="mt-1 text-[10px] text-[#607765]">{product.unitLabel}당 {won(product.unitPrice)}</p> : null}<p className="mt-1 text-[10px] text-[#829184]">마지막 확인 {formatDate(product.confirmedPrice?.checkedAt ?? product.lastSeenAt)}</p>{includeAutomaticDeferred && nextRefreshAt ? <div className={`mt-2 rounded-xl px-2.5 py-2 text-[10px] ${isRefreshDue ? "bg-[#fff2d8] text-[#94601a]" : "bg-[#eef4ff] text-[#3567a8]"}`}><p className="font-bold">{isRefreshDue ? "재확인 순번 대기" : "다음 API 재확인"} {formatDate(nextRefreshAt)}</p>{product.recheckQueuePosition ? <p className="mt-1">대기 순번 {product.recheckQueuePosition} / {product.automaticQueueSize}</p> : null}{product.lastRefreshAttemptAt ? <p className="mt-1">최근 시도 {formatDate(new Date(product.lastRefreshAttemptAt))}</p> : null}<p className="mt-1 leading-4"><strong>재확인 대기 사유:</strong> {describeRecheckReason(product.lastRefreshReason)}</p></div> : null}</div>
          <div className="flex shrink-0 flex-col items-end gap-2"><div className="flex items-center gap-1">{isSoldOut ? <span className="rounded-full bg-[#f0f2f0] px-2 py-1 text-[10px] font-bold text-[#646b66]">품절</span> : <span title={confirmation.description} className={`rounded-full px-2 py-1 text-[10px] font-bold ${confirmation.needsConfirmation ? "bg-[#fff2d8] text-[#94601a]" : "bg-[#e7f3e9] text-[#176b3a]"}`}>{confirmation.label}</span>}{!isSoldOut ? <button type="button" onClick={() => toggleOptionEditor(product)} aria-pressed={isEditingOption} className={`inline-flex min-h-7 items-center gap-1 rounded-full px-2 text-[10px] font-bold ring-1 ${isEditingOption ? "bg-[#176b3a] text-white ring-[#176b3a]" : "bg-white text-[#176b3a] ring-[#b9d8c0]"}`}><Pencil className="size-3" />{isEditingOption ? "닫기" : hasConfiguration ? "수정" : "구성 입력"}</button> : null}</div>{canManageDeferredProduct && !isSoldOut ? <><button type="button" onClick={() => markDeferredProductSoldOut(product.id, product.name)} disabled={markSoldOut.isPending} className="inline-flex min-h-8 items-center gap-1 rounded-xl border border-[#ecd09f] bg-[#fffaf0] px-2.5 text-[10px] font-bold text-[#94601a] disabled:opacity-50"><CircleOff className="size-3" />품절</button><button type="button" onClick={() => removeDeferredProduct(product.id, product.name)} disabled={removeDeferred.isPending} className="inline-flex min-h-8 items-center gap-1 rounded-xl border border-[#edc8c3] bg-[#fff8f7] px-2.5 text-[10px] font-bold text-[#a44c45] disabled:opacity-50"><Trash2 className="size-3" />삭제</button></> : null}</div>
        </div>
        {showOptionEditor && !isSoldOut ? <div className="mt-3 rounded-2xl bg-[#fffaf0] p-3"><p className="text-[10px] font-bold text-[#94601a]">{hasMissingOption ? "누락 옵션 함께 입력" : hasConfiguration ? "옵션·용량·수량 수정" : "구성 정보를 입력해 정확 SKU 찾기"}</p><p className="mt-1 text-[10px] leading-4 text-[#876f44]">입력값은 저장 전에도 아래 쿠팡 검색어에 반영됩니다. 같은 구성의 상품을 찾은 뒤 정확 SKU를 수집기로 다시 관측해 주세요.</p><div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3"><input value={optionDrafts[product.id]?.option ?? ""} onChange={event => updateDraft(product.id, "option", event.target.value)} placeholder="옵션명" className="rounded-xl border border-[#eadfbd] bg-white px-3 py-2.5 text-xs outline-none focus:border-[#a36c12]" /><input value={optionDrafts[product.id]?.capacity ?? ""} onChange={event => updateDraft(product.id, "capacity", event.target.value)} placeholder="용량 예: 80ml" className="rounded-xl border border-[#eadfbd] bg-white px-3 py-2.5 text-xs outline-none focus:border-[#a36c12]" /><input inputMode="numeric" value={optionDrafts[product.id]?.quantity ?? ""} onChange={event => updateDraft(product.id, "quantity", event.target.value.replace(/[^0-9]/g, ""))} placeholder="수량 예: 2" className="rounded-xl border border-[#eadfbd] bg-white px-3 py-2.5 text-xs outline-none focus:border-[#a36c12]" /></div></div> : null}
        {needsPurchaseFallback ? <div className="mt-3 rounded-xl border border-[#f0ddbf] bg-[#fffaf1] p-3"><p className="text-[11px] font-extrabold text-[#7b581d]">딥링크 생성 실패 사유: {deepLinkFailure.title}</p><p className="mt-1 text-[10px] leading-4 text-[#8b7449]">{deepLinkFailure.detail}</p><p className="mt-2 rounded-lg bg-white/70 px-2.5 py-2 text-[10px] leading-4 text-[#6d572e]"><strong>다음 조치:</strong> {deepLinkFailure.action}</p><a href={coupangSearchUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#176b3a]"><Link2 className="size-3.5" />{searchQualifiers.length ? "입력한 구성으로 쿠팡 검색" : "쿠팡에서 같은 상품 검색"}<ExternalLink className="size-3.5" /></a></div> : link ? <a href={link} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#b9d8c0] bg-[#f4fbf5] text-xs font-bold text-[#176b3a]"><Link2 className="size-3.5" />쿠팡 딥링크 열기<ExternalLink className="size-3.5" /></a> : <p className="mt-3 rounded-xl bg-[#f4f7f3] p-3 text-center text-[11px] text-[#718071]">저장된 링크가 없습니다.</p>}
        {canRefreshDeepLink && !isSoldOut ? <button type="button" onClick={() => refreshProductDeepLink(product.id, product.name)} disabled={refreshDeepLink.isPending} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#9bcdaa] bg-[#eff9f1] text-xs font-extrabold text-[#176b3a] disabled:opacity-50"><RefreshCw className={`size-3.5 ${refreshDeepLink.isPending ? "animate-spin" : ""}`} />{refreshDeepLink.isPending ? "딥링크 갱신 중" : "딥링크 갱신"}</button> : null}
        {deepLinkRefreshResult ? <div role="status" aria-live="polite" className={`mt-2 rounded-xl border px-3 py-2.5 ${getDeepLinkRefreshResultPresentation(deepLinkRefreshResult.status).className}`}><p className="text-[11px] font-extrabold">{getDeepLinkRefreshResultPresentation(deepLinkRefreshResult.status).title}</p><p className="mt-1 text-[10px] leading-4">{deepLinkRefreshResult.message}</p></div> : null}
        {!isSoldOut ? <div className="mt-3 flex gap-2"><input inputMode="numeric" value={drafts[product.id] ?? ""} onChange={event => setDrafts(previous => ({ ...previous, [product.id]: event.target.value }))} placeholder="확인 가격(원)" className="min-w-0 flex-1 rounded-xl border border-[#d9e6d9] bg-[#fbfdfb] px-3 py-2.5 text-xs outline-none focus:border-[#6d9ec7]" /><button type="button" onClick={() => showOptionEditor ? saveCombinedProduct(product.id) : savePrice(product.id)} disabled={save.isPending || updateOptions.isPending} className="rounded-xl bg-[#176b3a] px-4 py-2.5 text-[11px] font-bold text-white disabled:opacity-50">{showOptionEditor ? "옵션·가격 저장" : "저장"}</button></div> : <p className="mt-3 rounded-xl bg-[#f4f7f3] p-3 text-center text-[11px] font-bold text-[#646b66]">품절 관측 상품은 가격 업데이트·보류 가격 입력 대상에서 제외됩니다.</p>}
      </article>;
    })}
    <PageControls page={deferredPage} total={filteredProducts.length} onChange={setDeferredPage} label="보류 상품" />
  </section>;
}
