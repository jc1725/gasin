import { BellRing, Heart, LogIn } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import ProductCard from "@/components/ProductCard";
import { useFavorites } from "@/hooks/useFavorites";
import { trpc } from "@/lib/trpc";

export default function Favorites() {
  const { isGoogleUser, favoriteProducts, favoritesLoading, favoriteIds, toggleProduct } = useFavorites();
  const utils = trpc.useUtils();
  const { data: userConfirmedPrices } = trpc.userPrices.listLatestForFavorites.useQuery(undefined, { enabled: isGoogleUser });
  const { data: targetPriceSettings } = trpc.favorites.listTargetPrices.useQuery(undefined, { enabled: isGoogleUser });
  const { data: alertObservationStatuses } = trpc.favorites.alertObservationStatus.useQuery(undefined, { enabled: isGoogleUser });
  const [editingTargetProductId, setEditingTargetProductId] = useState<number | null>(null);
  const [targetPriceDraft, setTargetPriceDraft] = useState("");
  const targetPriceMutation = trpc.favorites.setTargetPrice.useMutation({
    onSuccess: result => {
      toast.success(result.targetPrice ? "목표 가격을 저장했어요." : "목표 가격 알림을 해제했어요.");
      utils.favorites.listTargetPrices.invalidate();
      setEditingTargetProductId(null);
      setTargetPriceDraft("");
    },
    onError: error => toast.error(error.message),
  });
  const userConfirmedPriceByProductId = new Map((userConfirmedPrices ?? []).map(price => [price.productId, price]));
  const targetPriceByProductId = new Map((targetPriceSettings ?? []).map(setting => [setting.productId, setting.targetPrice]));
  const alertObservationByProductId = new Map((alertObservationStatuses ?? []).map(status => [status.productId, status]));

  const startTargetEdit = (productId: number, currentTarget: number | null) => {
    setEditingTargetProductId(productId);
    setTargetPriceDraft(currentTarget ? String(currentTarget) : "");
  };

  const saveTargetPrice = (productId: number) => {
    const targetPrice = Number(targetPriceDraft.replace(/[,\s]/g, ""));
    if (!Number.isSafeInteger(targetPrice) || targetPrice <= 0) {
      toast.error("1원 이상의 목표 가격을 입력해 주세요.");
      return;
    }
    targetPriceMutation.mutate({ productId, targetPrice });
  };

  if (!isGoogleUser) {
    return (
      <section className="flex min-h-[55vh] flex-col items-center justify-center text-center">
        <span className="grid size-16 place-items-center rounded-3xl bg-[#e5f2e7] text-[#176b3a]"><Heart className="size-7" /></span>
        <h1 className="mt-5 text-xl font-extrabold tracking-[-0.06em]">찜한상품을 모아보세요</h1>
        <p className="mt-2 max-w-xs text-sm leading-6 text-[#778679]">Google 로그인 후 관심 상품의 가격 변동을 편리하게 확인할 수 있습니다.</p>
        <button type="button" onClick={() => window.location.assign("/api/auth/google")} className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#176b3a] px-5 text-sm font-bold text-white shadow-[0_9px_20px_rgba(23,107,58,.18)] active:scale-[.97]">
          <LogIn className="size-4" /> Google로 로그인
        </button>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-6 flex items-end justify-between"><div><p className="text-xs font-bold text-[#308154]">MY WATCHLIST</p><h1 className="mt-1 text-2xl font-extrabold tracking-[-0.065em]">찜한상품</h1></div><span className="rounded-full bg-[#e5f2e7] px-3 py-1 text-xs font-bold text-[#176b3a]">{favoriteProducts.length}개</span></div>
      <div className="mb-5 flex gap-3 rounded-2xl border border-[#cfe7d5] bg-[#eff9f1] px-4 py-3.5">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-[#d8f0de] text-[#176b3a]"><BellRing className="size-4" /></span>
        <div>
          <p className="text-sm font-bold text-[#176b3a]">찜하면 이메일 또는 앱 알림으로 알려드립니다.</p>
        </div>
      </div>
      {favoritesLoading ? <p className="py-16 text-center text-sm text-[#829184]">찜한상품을 불러오는 중입니다.</p> : null}
      {!favoritesLoading && favoriteProducts.length === 0 ? <p className="rounded-2xl bg-white py-16 text-center text-sm text-[#829184]">아직 찜한상품이 없습니다.</p> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {favoriteProducts.map(product => {
          const targetPrice = targetPriceByProductId.get(product.id) ?? null;
          const alertObservation = alertObservationByProductId.get(product.id);
          const isEditingTarget = editingTargetProductId === product.id;
          const hasReachedTarget = targetPrice !== null && alertObservation?.isFresh === true && (alertObservation.price ?? Number.POSITIVE_INFINITY) <= targetPrice;
          const observationMessage = alertObservation?.isFresh
            ? `알림 기준 회원가 ${new Intl.NumberFormat("ko-KR").format(alertObservation.price ?? 0)}원 · ${new Date(alertObservation.observedAt!).toLocaleDateString("ko-KR")} 관측`
            : alertObservation?.observedAt
              ? "최근 수집이 부족합니다 · 7일이 지난 관측값은 알림에 사용하지 않습니다."
              : "최근 수집이 부족합니다 · 확장 프로그램에서 이 상품을 다시 열어 가격을 수집해 주세요.";
          return <div key={product.id} className="min-w-0"><ProductCard product={product} isFavorite={favoriteIds.has(product.id)} onFavorite={toggleProduct} userConfirmedPrice={userConfirmedPriceByProductId.get(product.id)} /><section className="mt-2 rounded-xl border border-[#dcecdf] bg-[#f7fbf7] p-2.5"><div className="flex items-center justify-between gap-1"><p className="text-[10px] font-extrabold text-[#356342]">목표 가격 알림</p>{targetPrice && !isEditingTarget ? <button type="button" onClick={() => startTargetEdit(product.id, targetPrice)} className="text-[10px] font-bold text-[#176b3a]">수정</button> : null}</div><p className={`mt-1 text-[10px] leading-4 ${alertObservation?.isFresh ? "text-[#356342]" : "text-[#a15e42]"}`}>{observationMessage}</p>{isEditingTarget ? <form className="mt-2" onSubmit={event => { event.preventDefault(); saveTargetPrice(product.id); }}><label className="sr-only" htmlFor={`target-price-${product.id}`}>목표 가격</label><input id={`target-price-${product.id}`} inputMode="numeric" type="number" min="1" value={targetPriceDraft} onChange={event => setTargetPriceDraft(event.target.value)} placeholder="예: 25000" className="h-9 w-full rounded-lg border border-[#bfdac5] bg-white px-2 text-xs font-bold text-[#1f3424] outline-none focus:ring-2 focus:ring-[#91caa0]" /><div className="mt-2 flex gap-1.5"><button type="submit" disabled={targetPriceMutation.isPending} className="h-8 flex-1 rounded-lg bg-[#176b3a] px-2 text-[10px] font-bold text-white disabled:opacity-60">{targetPriceMutation.isPending ? "저장 중" : "저장"}</button>{targetPrice ? <button type="button" onClick={() => targetPriceMutation.mutate({ productId: product.id, targetPrice: null })} disabled={targetPriceMutation.isPending} className="h-8 rounded-lg border border-[#c4d8c8] px-2 text-[10px] font-bold text-[#58735e] disabled:opacity-60">해제</button> : null}<button type="button" onClick={() => { setEditingTargetProductId(null); setTargetPriceDraft(""); }} className="h-8 rounded-lg px-2 text-[10px] font-bold text-[#718071]">취소</button></div></form> : <button type="button" onClick={() => startTargetEdit(product.id, targetPrice)} className="mt-1.5 flex w-full items-center justify-between gap-1 text-left"><span className={`truncate text-[11px] font-extrabold ${hasReachedTarget ? "text-[#118245]" : "text-[#28462f]"}`}>{targetPrice ? `${new Intl.NumberFormat("ko-KR").format(targetPrice)}원 이하` : "목표 가격 설정"}</span><span className="shrink-0 text-[10px] font-bold text-[#176b3a]">{hasReachedTarget ? "도달" : "설정"}</span></button>}</section></div>;
        })}
      </div>
    </section>
  );
}
