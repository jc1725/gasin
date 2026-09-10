import { LoaderCircle, Search } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import ProductCard, { type ProductCardItem } from "@/components/ProductCard";
import { useFavorites } from "@/hooks/useFavorites";
import { trpc } from "@/lib/trpc";
import { getSearchKeywordFromLocation, getSearchLocation, loadSearchSnapshot, saveSearchSnapshot } from "@/lib/searchNavigationState";
import { sortSearchResultProducts, type SearchResultSort } from "@/lib/searchResultSort";
import { useLocation } from "wouter";

function formatRetryTime(value?: Date | string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

type SearchResultSnapshot = {
  products: ProductCardItem[];
  source: "cache" | "database" | "coupang" | "rate_limited";
  retryAt?: Date | string;
  limitReason?: "minute-limit" | "emergency-block";
  message?: string;
};

export default function SearchProducts() {
  const [, setLocation] = useLocation();
  const [routeKeyword, setRouteKeyword] = useState(() => typeof window === "undefined" ? "" : getSearchKeywordFromLocation(window.location.search));
  const [keyword, setKeyword] = useState(routeKeyword);
  const [lastSubmittedKeyword, setLastSubmittedKeyword] = useState<string | null>(routeKeyword || null);
  const [requestSubmittedKeyword, setRequestSubmittedKeyword] = useState<string | null>(null);
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [resultSort, setResultSort] = useState<SearchResultSort>("relevance");
  const [restoredSearch, setRestoredSearch] = useState<SearchResultSnapshot | null>(() => loadSearchSnapshot<SearchResultSnapshot>(routeKeyword));
  const search = trpc.catalog.search.useMutation();
  const materialize = trpc.catalog.materializeSearchResult.useMutation();
  const productRequest = trpc.productRequests.submit.useMutation({
    onSuccess: request => {
      setRequestSubmittedKeyword(request.normalizedKeyword);
      toast.success("상품 추가 요청을 관리자에게 전달했어요.");
    },
    onError: error => toast.error(error.message),
  });
  const searchStatus = trpc.catalog.searchStatus.useQuery();
  const suggestionInput = useMemo(() => ({ query: keyword.trim(), limit: 6 }), [keyword]);
  const suggestions = trpc.catalog.suggestions.useQuery(suggestionInput, { enabled: suggestionOpen && suggestionInput.query.length >= 2, staleTime: 30_000 });
  const { favoriteIds, toggleProduct } = useFavorites();
  const searchResult = search.data ?? restoredSearch;
  const displayedProducts = useMemo(() => sortSearchResultProducts(searchResult?.products ?? [], resultSort), [searchResult?.products, resultSort]);
  const searchRateLimitReason = searchResult?.source === "rate_limited" ? searchResult.limitReason : (!searchStatus.data?.allowed ? searchStatus.data?.reason : undefined);
  const searchRetryTime = formatRetryTime(searchResult?.source === "rate_limited" ? searchResult.retryAt : searchStatus.data?.retryAt);
  const isSearchRateLimited = searchResult?.source === "rate_limited" || searchStatus.data?.allowed === false;
  const usedOfficialCoupangApi = searchResult?.source === "coupang";

  useEffect(() => {
    setKeyword(routeKeyword);
    setLastSubmittedKeyword(routeKeyword || null);
    setRequestSubmittedKeyword(null);
    setRestoredSearch(loadSearchSnapshot<SearchResultSnapshot>(routeKeyword));
  }, [routeKeyword]);

  useEffect(() => {
    const restoreBrowserSearch = () => setRouteKeyword(getSearchKeywordFromLocation(window.location.search));
    window.addEventListener("popstate", restoreBrowserSearch);
    return () => window.removeEventListener("popstate", restoreBrowserSearch);
  }, []);

  const runSearch = (value: string) => {
    const normalizedKeyword = value.trim();
    if (!normalizedKeyword) return;
    const refresh = normalizedKeyword === lastSubmittedKeyword;
    setRequestSubmittedKeyword(null);
    setRestoredSearch(null);
    setResultSort("relevance");
    setSuggestionOpen(false);
    setActiveSuggestionIndex(-1);
    const searchLocation = getSearchLocation(normalizedKeyword);
    const currentLocation = typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}`;
    if (currentLocation !== searchLocation) setLocation(searchLocation);
    setRouteKeyword(normalizedKeyword);
    search.mutate({ keyword: normalizedKeyword, limit: 10, refresh }, {
      onSuccess: result => {
        saveSearchSnapshot(normalizedKeyword, result);
        setRestoredSearch(result);
      },
    });
    setLastSubmittedKeyword(normalizedKeyword);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    runSearch(keyword);
  };

  const selectSuggestion = (suggestion: string) => {
    setKeyword(suggestion);
    runSearch(suggestion);
  };

  const handleSuggestionKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const items = suggestions.data ?? [];
    if (!suggestionOpen || items.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestionIndex(current => (current + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestionIndex(current => (current <= 0 ? items.length - 1 : current - 1));
    } else if (event.key === "Escape") {
      event.preventDefault();
      setSuggestionOpen(false);
      setActiveSuggestionIndex(-1);
    } else if (event.key === "Enter" && activeSuggestionIndex >= 0) {
      event.preventDefault();
      selectSuggestion(items[activeSuggestionIndex]!.keyword);
    }
  };

  const submitProductRequest = () => {
    const normalizedKeyword = keyword.trim();
    if (!normalizedKeyword) return;
    productRequest.mutate({ keyword: normalizedKeyword });
  };

  // 검색 결과는 클릭하기 전까지 저장되지 않는다(id: null). 이미 저장된(=이미
  // 추적 중인) 상품은 바로 열고, 아직 저장되지 않은 상품은 이 순간에 실제로
  // 저장(가격 추적 시작)한 뒤 방금 받은 id로 이동한다.
  const materializeThen = async (product: ProductCardItem, onReady: (productId: number) => void) => {
    if (product.id != null) {
      onReady(product.id);
      return;
    }
    if (!product.pendingMaterialize) return;
    try {
      const saved = await materialize.mutateAsync(product.pendingMaterialize);
      onReady(saved.id);
    } catch {
      toast.error("검색 결과가 만료되었습니다. 다시 검색해 주세요.");
    }
  };

  const openProduct = (product: ProductCardItem) => {
    void materializeThen(product, productId => setLocation(`/product/${productId}`));
  };

  const favoriteProduct = (product: ProductCardItem) => {
    void materializeThen(product, productId => toggleProduct(productId));
  };

  return (
    <section>
      <p className="text-xs font-bold text-[#308154]">COUPANG PARTNERS</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-[-0.065em]">상품 검색</h1>
      <div className="relative mt-6">
        <form onSubmit={submit} className="flex rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-[#dfe9e0]">
          <input value={keyword} onFocus={() => setSuggestionOpen(true)} onBlur={() => window.setTimeout(() => setSuggestionOpen(false), 120)} onKeyDown={handleSuggestionKeyDown} onChange={event => { setKeyword(event.target.value); setSuggestionOpen(true); setActiveSuggestionIndex(-1); }} placeholder="찾고 싶은 상품을 입력하세요" role="combobox" aria-autocomplete="list" aria-expanded={suggestionOpen && (suggestions.data?.length ?? 0) > 0} aria-controls="search-suggestions" aria-activedescendant={activeSuggestionIndex >= 0 ? `search-suggestion-${activeSuggestionIndex}` : undefined} className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-[#a0aca2]" />
          <button type="submit" disabled={!keyword.trim() || search.isPending} aria-label={search.isPending ? "쿠팡 가격 검색 중" : "상품 검색"} className="grid size-10 place-items-center rounded-xl bg-[#176b3a] text-white disabled:opacity-40 active:scale-95">{search.isPending ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Search className="size-4" />}</button>
        </form>
        {suggestionOpen && (suggestions.data?.length ?? 0) > 0 ? <div id="search-suggestions" role="listbox" aria-label="연관 검색어" className="absolute inset-x-0 z-30 mt-2 overflow-hidden rounded-2xl border border-[#dce8de] bg-white p-1.5 shadow-[0_14px_28px_rgba(19,63,34,.16)] dark:border-[#31513c] dark:bg-[#183024]">{suggestions.data?.map((item, index) => <button key={`${item.source}-${item.keyword}`} id={`search-suggestion-${index}`} type="button" role="option" aria-selected={activeSuggestionIndex === index} onMouseDown={event => event.preventDefault()} onClick={() => selectSuggestion(item.keyword)} className={`flex min-h-10 w-full items-center justify-between rounded-xl px-3 text-left text-xs transition ${activeSuggestionIndex === index ? "bg-[#e4f3e7] text-[#176b3a]" : "text-[#38513e] hover:bg-[#f2f8f3] dark:text-[#d8eddb] dark:hover:bg-[#244632]"}`}><span className="truncate font-semibold">{item.keyword}</span><span className="ml-3 shrink-0 text-[10px] text-[#7c927f]">{item.source === "product" ? "상품" : "검색어"}</span></button>)}</div> : null}
      </div>
      {isSearchRateLimited ? <div role="alert" className="mt-3 rounded-xl border border-[#f0d59c] bg-[#fff7e8] p-3 text-xs leading-5 text-[#8a5a13]"><p className="font-bold">{searchRateLimitReason === "minute-limit" ? "쿠팡 API 요청이 많습니다." : "외부 검색이 일시적으로 보호 모드입니다."}</p><p className="mt-0.5">잠시 후 다시 시도해 주세요.{searchRetryTime ? ` ${searchRetryTime} 이후에 다시 검색할 수 있습니다.` : ""}</p></div> : null}
      {search.isPending ? <div role="status" aria-live="polite" className="mt-6 overflow-hidden rounded-2xl border border-[#d9eadc] bg-white shadow-sm"><div className="h-1 bg-[#dcefe0]"><div className="h-full w-2/5 animate-pulse rounded-full bg-[#26985b] motion-reduce:animate-none" /></div><div className="flex items-center gap-3 p-5"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e5f4e8] text-[#187340]"><LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" /></span><div><p className="text-sm font-bold text-[#28573a]">최신 가격을 확인하고 있어요</p><p className="mt-0.5 text-xs leading-5 text-[#718575]">저장 가격이 없으면 쿠팡 공식 API로 최신 결과를 조회합니다.</p></div></div></div> : null}
      {search.error ? <p className="mt-6 rounded-xl bg-[#fff4f3] p-4 text-sm text-[#b0463e]">{search.error.message}</p> : null}
      {usedOfficialCoupangApi ? <div role="status" className="mt-3 space-y-2"><p className="inline-flex rounded-full bg-[#e5f2e7] px-3 py-1.5 text-xs font-bold text-[#176b3a]">쿠팡 API 호출 완료 · 관련도 통과 {searchResult?.products.length ?? 0}개</p>{searchResult?.products.length === 0 && searchResult.message ? <p className="rounded-xl border border-[#e8d9b6] bg-[#fffaf0] p-3 text-xs leading-5 text-[#80641f]">{searchResult.message} 검색어의 브랜드·상품 유형·용량을 확인해 다시 시도해 주세요.</p> : null}</div> : null}
      {searchResult && searchResult.products.length === 0 && searchResult.source !== "rate_limited" ? <section className="mt-6 rounded-2xl border border-[#dbe7da] bg-white p-5 text-center shadow-sm"><p className="text-sm font-bold text-[#365841]">검색 결과가 없습니다.</p><button type="button" onClick={submitProductRequest} disabled={productRequest.isPending || requestSubmittedKeyword === keyword.trim().toLowerCase()} className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-[#176b3a] px-4 text-xs font-bold text-white transition hover:bg-[#125a30] active:scale-95 disabled:opacity-60">{requestSubmittedKeyword === keyword.trim().toLowerCase() ? "상품 추가 요청 완료" : productRequest.isPending ? "요청 전달 중" : "상품 추가 요청하기"}</button></section> : null}
      {searchResult && searchResult.products.length > 0 ? <div className="mt-5 flex flex-wrap items-center gap-2"><span className="mr-1 text-[11px] font-bold text-[#607765]">정렬</span><button type="button" onClick={() => setResultSort("relevance")} aria-pressed={resultSort === "relevance"} className={`min-h-8 rounded-full px-3 text-[11px] font-bold ${resultSort === "relevance" ? "bg-[#176b3a] text-white" : "bg-white text-[#607765] ring-1 ring-[#dce8de]"}`}>관련도순</button><button type="button" onClick={() => setResultSort("priceAsc")} aria-pressed={resultSort === "priceAsc"} className={`min-h-8 rounded-full px-3 text-[11px] font-bold ${resultSort === "priceAsc" ? "bg-[#176b3a] text-white" : "bg-white text-[#607765] ring-1 ring-[#dce8de]"}`}>낮은 가격순</button><span title="쿠팡 파트너스 공식 검색 API가 리뷰 수를 제공하지 않아 정렬할 수 없습니다." className="min-h-8 rounded-full bg-[#f1f4f1] px-3 py-2 text-[10px] font-semibold text-[#829184]">리뷰 많은 순 · 정보 없음</span></div> : null}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {displayedProducts.map(product => <ProductCard key={product.externalProductId ?? product.id} product={product} isFavorite={product.id != null && favoriteIds.has(product.id)} onOpen={openProduct} onFavorite={favoriteProduct} />)}
      </div>
    </section>
  );
}
