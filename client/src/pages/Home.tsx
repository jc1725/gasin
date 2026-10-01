import { ArrowRight, ChartNoAxesCombined, LogIn, Search, Sparkles } from "lucide-react";
import { Link } from "wouter";
import GiveSummary from "@/components/GiveSummary";
import ProductCard from "@/components/ProductCard";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import { useFavorites } from "@/hooks/useFavorites";
import { trpc } from "@/lib/trpc";
import { DONATION_RATE_PCT, GIVE_PATH, GIVE_PROMISE } from "@shared/give";

export default function Home() {
  const featured = trpc.catalog.homeFeatured.useQuery({ limit: 50 });
  const stats = trpc.siteStats.public.useQuery();
  const { isGoogleUser, favoriteIds, toggleProduct } = useFavorites();

  return (
    <section>
      <div className="relative overflow-hidden rounded-3xl bg-[#176b3a] px-6 py-7 text-white shadow-[0_20px_45px_rgba(23,107,58,.22)]">
        <div className="absolute -right-9 -top-12 size-48 rounded-full border-[22px] border-white/8" />
        <div className="relative">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/13 px-2.5 py-1 text-[10px] font-bold text-[#d8f0dc]"><Sparkles className="size-3" />쿠팡 가기 전, 가신 한번.</span>
          {/* 2026-10-01 리뉴얼 1단계: 히어로를 "쿠팡 가기 전에 들르는 사이트" 포지셔닝으로 바꾼다. 기부는 클릭·구매 행위에 묶지 않고 회사 정책 사실로만 적는다(shared/give.ts). */}
          <h1 className="mt-4 text-[27px] font-extrabold leading-[1.14] tracking-[-0.08em]">쿠팡 살 때,<br />그냥 들어가지 마세요.</h1>
          <p className="mt-3 max-w-72 text-[13px] leading-5 text-[#d8f0dc]">와우회원가와 가격 이력으로 가격을 한 번 더 확인하세요. {GIVE_PROMISE}</p>
          <p className="mt-2 text-[11px] font-bold text-[#bfe0c5]">가격 확인 · 가격 알림 · 착한경유</p>
          {!isGoogleUser && <button type="button" onClick={() => window.location.assign("/api/auth/google")} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3.5 text-xs font-extrabold text-[#176b3a] active:scale-[.97]"><LogIn className="size-3.5" /> Google 로그인</button>}
        </div>
      </div>

      <Link href="/search" className="mt-5 flex h-13 items-center gap-3 rounded-2xl bg-white px-4 text-sm text-[#7a877c] shadow-sm ring-1 ring-[#dfe9e0]"><Search className="size-4 text-[#176b3a]" />가격 변화를 보려면 여기에 검색하세요<ArrowRight className="ml-auto size-4 text-[#a0aca2]" /></Link>
      {/* 2026-10-01: 쿠팡 위젯 위 안내. 위젯이 무엇인지와 파트너스 고지만 적는다 — 위젯(광고) 바로 위에서
          검색·구매를 권하는 문구는 운영정책 4.1 2) 클릭 유도 문구로 볼 소지가 있어 쓰지 않는다(인환님 선택). */}
      <p className="mt-4 px-1 text-[11px] leading-5 text-[#5d6d60]">아래는 쿠팡 상품 검색창이에요. 이 검색창은 쿠팡 파트너스 활동의 일환으로, 이를 통한 구매에 대해 가신이 일정액의 수수료를 받아요. 받은 수수료(세후)의 {DONATION_RATE_PCT}%는 기부합니다. <Link href={GIVE_PATH} className="font-bold text-[#176b3a]">기부 기준 보기</Link></p>
      <div className="mt-2 overflow-hidden rounded-2xl border border-[#b9d8c0] bg-white shadow-sm" aria-label="쿠팡 제휴 위젯"><iframe src="https://coupa.ng/cphOHP" title="쿠팡 상품 위젯" width="100%" height="75" frameBorder="0" scrolling="no" referrerPolicy="unsafe-url" className="block w-full" /></div>
      <PwaInstallPrompt persistent inline />
      <GiveSummary />
      <section aria-label="가신 서비스 지표" className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#e2ebe1]"><div className="flex items-center justify-between"><div><p className="text-[10px] font-extrabold tracking-[.12em] text-[#308154]">GASYN DATA</p><h2 className="mt-1 text-base font-extrabold tracking-[-.04em]">가격 기록으로 가격을 해독하세요</h2></div><Link href="/guide" className="text-xs font-bold text-[#176b3a]">가이드 보기</Link></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-[#f2f8f3] p-3"><p className="text-[10px] font-bold text-[#5e7564]">현재 추적 상품</p><p className="mt-1 text-xl font-extrabold text-[#176b3a]">{stats.data ? new Intl.NumberFormat("ko-KR").format(stats.data.activeTrackedProducts) : "…"}<span className="ml-1 text-[10px] text-[#638069]">개</span></p></div><div className="rounded-2xl bg-[#f2f8f3] p-3"><p className="text-[10px] font-bold text-[#5e7564]">누적 가격 기록</p><p className="mt-1 text-xl font-extrabold text-[#176b3a]">{stats.data ? new Intl.NumberFormat("ko-KR").format(stats.data.priceObservations) : "…"}<span className="ml-1 text-[10px] text-[#638069]">건</span></p></div></div><p className="mt-3 text-[11px] leading-5 text-[#708075]">할인율만 보지 말고 옵션별 가격 이력과 와우회원가를 함께 비교하세요. 최종 구매가는 쿠팡에서 확인하세요.</p><Link href="/methodology" className="mt-3 inline-flex items-center gap-1 text-[11px] font-extrabold text-[#176b3a]">가신의 가격 검증 방법 보기 <ArrowRight className="size-3.5" /></Link></section>
      <div className="mt-8 flex items-end justify-between"><div><p className="text-xs font-bold text-[#308154]">COUPANG CATEGORY BEST</p><h2 className="mt-1 text-xl font-extrabold tracking-[-0.06em]">{featured.data?.source === "bestcategory" ? "카테고리 베스트 상품" : "쿠팡 특가 상품"}</h2></div><Link href="/goldbox" className="text-xs font-bold text-[#176b3a]">골드박스 전체보기</Link></div>
      {featured.isLoading ? <p className="py-16 text-center text-sm text-[#829184]">카테고리 베스트 상품을 불러오는 중입니다.</p> : null}
      {!featured.isLoading && featured.data?.products.length === 0 ? <div className="mt-5 rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-[#e9efea]"><span className="mx-auto grid size-11 place-items-center rounded-2xl bg-[#e5f2e7] text-[#176b3a]"><ChartNoAxesCombined className="size-5" /></span><p className="mt-4 text-sm font-bold">카테고리 베스트 상품을 준비 중입니다</p><p className="mt-1 text-xs leading-5 text-[#829184]">공식 카테고리 베스트 수집 후 이곳에 표시됩니다.</p></div> : null}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{featured.data?.products.map((product, index) => <ProductCard key={product.id} product={product} priority={index === 0} isFavorite={favoriteIds.has(product.id)} onFavorite={item => { if (item.id != null) toggleProduct(item.id); }} />)}</div>
    </section>
  );
}
