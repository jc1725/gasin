import { ArrowRight, BarChart3, BellRing, CircleHelp, SearchCheck } from "lucide-react";
import { Link } from "wouter";
import { guideFaqs, snsShareCopy } from "@/lib/guideContent";
import { trpc } from "@/lib/trpc";

const guideIcons = [SearchCheck, BarChart3, BellRing, CircleHelp, SearchCheck] as const;

function compactNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export default function Guide() {
  const stats = trpc.siteStats.public.useQuery();

  return (
    <section className="pb-5">
      <div className="relative overflow-hidden rounded-3xl bg-[#176b3a] px-6 py-8 text-white shadow-[0_18px_42px_rgba(23,107,58,.2)]">
        <div className="absolute -right-10 -top-12 size-44 rounded-full border-[20px] border-white/10" />
        <div className="relative">
          <p className="text-[11px] font-extrabold tracking-[.12em] text-[#d8f0dc]">GASYN GUIDE</p>
          <h1 className="mt-2 text-[27px] font-extrabold tracking-[-.06em]">가격을 해독하는 가이드</h1>
          <p className="mt-3 max-w-[32rem] text-sm leading-6 text-[#d8f0dc]">와우회원가, 옵션별 가격 비교, 목표가 알림으로 진짜 가격 흐름을 확인하는 방법입니다.</p>
        </div>
      </div>

      <section aria-label="가신 서비스 데이터" className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#e2ebe1]"><p className="text-[11px] font-bold text-[#6b7d6f]">현재 추적 상품</p><p className="mt-1 text-2xl font-extrabold tracking-[-.05em] text-[#176b3a]">{stats.data ? compactNumber(stats.data.activeTrackedProducts) : "…"}<span className="ml-1 text-xs text-[#58725f]">개</span></p></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#e2ebe1]"><p className="text-[11px] font-bold text-[#6b7d6f]">누적 가격 기록</p><p className="mt-1 text-2xl font-extrabold tracking-[-.05em] text-[#176b3a]">{stats.data ? compactNumber(stats.data.priceObservations) : "…"}<span className="ml-1 text-xs text-[#58725f]">건</span></p></div>
        <p className="col-span-2 px-1 text-[11px] leading-5 text-[#718075]">기준: 공개 중인 추적 상품과 가신 가격 이력입니다. 외부 수집 원본 관측은 {stats.data ? compactNumber(stats.data.collectorObservations) : "…"}건을 별도로 보관합니다.</p>
      </section>

      <section aria-label="SNS 공유용 소개" className="mt-5 rounded-3xl border border-[#cce4d1] bg-[#eef8f0] p-5">
        <p className="text-[10px] font-extrabold tracking-[.12em] text-[#308154]">SHARE GASYN</p>
        <p className="mt-2 text-[18px] font-extrabold leading-7 tracking-[-.045em] text-[#176b3a]">“{snsShareCopy.headline}”</p>
        <p className="mt-2 text-[12px] leading-5 text-[#55705c]">{snsShareCopy.description}</p>
      </section>

      <section aria-label="가격 검증 방법 안내" className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#e2ebe1]">
        <p className="text-[10px] font-extrabold tracking-[.12em] text-[#308154]">PRICE DECODING METHOD</p>
        <h2 className="mt-2 text-[18px] font-extrabold tracking-[-.045em] text-[#203425]">가신은 가격을 어떻게 검증하나요?</h2>
        <p className="mt-2 text-[12px] leading-5 text-[#5d6d60]">같은 옵션 SKU인지, 최근 와우회원가 관측인지, 90일 가격 이력에서 어느 위치인지 확인하는 기준을 공개합니다.</p>
        <Link href="/methodology" className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-[#176b3a]">가격 검증 방법 보기 <ArrowRight className="size-3.5" /></Link>
      </section>

      <div className="mt-7 space-y-4">
        {guideFaqs.map((faq, index) => {
          const Icon = guideIcons[index];
          return <article key={faq.question} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#e2ebe1]">
            <div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e5f2e7] text-[#176b3a]"><Icon className="size-4" /></span><div><h2 className="text-[17px] font-extrabold leading-6 tracking-[-.045em] text-[#203425]">{faq.question}</h2><p className="mt-3 text-[13px] leading-6 text-[#5d6d60]">{faq.answer}</p><Link href="/search" className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-[#176b3a]">가신으로 이 상품 가격 추적하기 <ArrowRight className="size-3.5" /></Link></div></div>
          </article>;
        })}
      </div>
    </section>
  );
}
