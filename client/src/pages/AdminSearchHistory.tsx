import { ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { isAdminUser } from "@shared/const";

const formatDate = (value: Date | string) => new Date(value).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

function sourceLabel(source: string) {
  if (source === "cache") return "저장 결과";
  if (source === "database") return "추적 목록";
  if (source === "coupang") return "쿠팡 공식 API";
  if (source === "rate_limited") return "보호 모드";
  return source;
}

export default function AdminSearchHistory() {
  const { user, loading } = useAuth();
  const isAdmin = isAdminUser(user);
  const searchEvents = trpc.adminPrices.listSearchEvents.useQuery(undefined, { enabled: isAdmin });

  if (loading) return <p className="py-24 text-center text-sm text-[#829184]">관리자 확인 중입니다.</p>;
  if (!user || !isAdmin) return <section className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-[#e2ebe1]"><ShieldCheck className="mx-auto size-8 text-[#a44c45]" /><h1 className="mt-3 text-lg font-extrabold">접근 권한이 없습니다</h1><p className="mt-2 text-xs leading-5 text-[#718071]">지정된 관리자 계정만 검색 기록을 볼 수 있습니다.</p></section>;

  return <section>
    <div className="mb-5 flex items-center justify-between"><Link href="/admin" className="grid size-10 place-items-center rounded-full bg-white text-[#36543e] shadow-sm ring-1 ring-[#e2ebe1]" aria-label="가격 관리로 돌아가기"><ArrowLeft className="size-4" /></Link><button type="button" onClick={() => searchEvents.refetch()} className="grid size-10 place-items-center rounded-full bg-white text-[#176b3a] shadow-sm ring-1 ring-[#e2ebe1]" aria-label="사용자 검색 기록 새로고침"><RefreshCw className="size-4" /></button></div>
    <header className="rounded-3xl bg-[#176b3a] p-5 text-white shadow-[0_12px_30px_rgba(23,107,58,.2)]"><p className="text-xs font-bold tracking-wide text-[#d9f0dd]">ADMIN ONLY · SEARCH ACTIVITY</p><h1 className="mt-2 text-xl font-extrabold tracking-[-0.05em]">사용자 검색 기록</h1><p className="mt-2 text-xs leading-5 text-[#d9f0dd]">검색어·시각·결과 상태만 표시합니다. 사용자 이메일과 IP 주소는 기록하거나 보여주지 않습니다.</p></header>
    <section className="mt-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-[#e2ebe1]">
      {searchEvents.isLoading ? <p className="py-12 text-center text-xs text-[#718071]">검색 기록을 불러오는 중입니다.</p> : null}
      {searchEvents.data?.length === 0 ? <p className="rounded-2xl bg-[#f4f7f3] p-5 text-center text-xs text-[#718071]">아직 기록된 사용자 검색이 없습니다.</p> : null}
      {searchEvents.data?.length ? <div className="divide-y divide-[#edf1ed]">{searchEvents.data.map(event => <article key={event.id} className="py-3 first:pt-0 last:pb-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-[#25362a]">{event.keyword}</p><p className="mt-1 text-[10px] text-[#718071]">{formatDate(event.searchedAt)} · {event.userId ? "로그인 사용자" : "비로그인 사용자"}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${event.resultSource === "rate_limited" ? "bg-[#fff2d8] text-[#94601a]" : "bg-[#e7f3e9] text-[#176b3a]"}`}>{sourceLabel(event.resultSource)} · {event.resultCount}개</span></div></article>)}</div> : null}
    </section>
  </section>;
}
