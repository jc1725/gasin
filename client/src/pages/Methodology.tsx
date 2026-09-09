import { ArrowRight, BadgeCheck, ChartNoAxesCombined, Clock3, SearchCheck, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { methodologyFaqs } from "@/lib/methodologyContent";
import { trpc } from "@/lib/trpc";

const methodologyIcons = [SearchCheck, Clock3, BadgeCheck, ChartNoAxesCombined, ShieldCheck] as const;

function compactNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export default function Methodology() {
  const stats = trpc.siteStats.public.useQuery();

  return (
    <section className="pb-5">
      <div className="relative overflow-hidden rounded-3xl bg-[#176b3a] px-6 py-8 text-white shadow-[0_18px_42px_rgba(23,107,58,.2)]">
        <div className="absolute -right-10 -top-12 size-44 rounded-full border-[20px] border-white/10" />
        <div className="relative">
          <p className="text-[11px] font-extrabold tracking-[.12em] text-[#d8f0dc]">PRICE DECODING METHOD</p>
          <h1 className="mt-2 text-[27px] font-extrabold tracking-[-.06em]">가신의 가격 검증 방법</h1>
          <p className="mt-3 max-w-[32rem] text-sm leading-6 text-[#d8f0dc]">가격을 있는 그대로 믿지 마세요. 가신은 옵션 SKU, 와우회원가 관측, 가격 이력을 함께 확인합니다.</p>
        </div>
      </div>

      <section aria-label="가신 서비스 데이터" className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#e2ebe1]"><p className="text-[11px] font-bold text-[#6b7d6f]">현재 추적 상품</p><p className="mt-1 text-2xl font-extrabold tracking-[-.05em] text-[#176b3a]">{stats.data ? compactNumber(stats.data.activeTrackedProducts) : "…"}<span className="ml-1 text-xs text-[#58725f]">개</span></p></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#e2ebe1]"><p className="text-[11px] font-bold text-[#6b7d6f]">누적 가격 기록</p><p className="mt-1 text-2xl font-extrabold tracking-[-.05em] text-[#176b3a]">{stats.data ? compactNumber(stats.data.priceObservations) : "…"}<span className="ml-1 text-xs text-[#58725f]">건</span></p></div>
        <p className="col-span-2 px-1 text-[11px] leading-5 text-[#718075]">기준: 공개 중인 추적 상품과 가신 가격 이력입니다. 외부 수집 원본 관측은 {stats.data ? compactNumber(stats.data.collectorObservations) : "…"}건을 별도로 보관합니다.</p>
      </section>

      <section aria-label="가격 검증 원칙" className="mt-6 rounded-3xl border border-[#cce4d1] bg-[#eef8f0] p-5">
        <p className="text-[10px] font-extrabold tracking-[.12em] text-[#308154]">WHAT GASYN CHECKS</p>
        <h2 className="mt-2 text-[19px] font-extrabold tracking-[-.045em] text-[#176b3a]">표시 가격이 아닌, 가격의 조건과 흐름을 봅니다</h2>
        <p className="mt-3 text-[13px] leading-6 text-[#55705c]">가신은 원가나 마진을 추정하지 않습니다. 대신 같은 옵션인지, 언제 확인한 회원 적용가인지, 최근 가격 이력에서 어느 위치인지 확인할 수 있도록 정보를 분리해 보여 줍니다.</p>
      </section>

      <div className="mt-6 space-y-4">
        {methodologyFaqs.map((faq, index) => {
          const Icon = methodologyIcons[index];
          return <article key={faq.question} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#e2ebe1]">
            <div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e5f2e7] text-[#176b3a]"><Icon className="size-4" /></span><div><h2 className="text-[17px] font-extrabold leading-6 tracking-[-.045em] text-[#203425]">{faq.question}</h2><p className="mt-3 text-[13px] leading-6 text-[#5d6d60]">{faq.answer}</p></div></div>
          </article>;
        })}
      </div>

      <section aria-label="가격 추적 시작" className="mt-6 rounded-3xl bg-[#1e5130] p-5 text-white shadow-[0_14px_32px_rgba(23,107,58,.18)]">
        <p className="text-[10px] font-extrabold tracking-[.12em] text-[#bfe0c5]">START TRACKING</p>
        <h2 className="mt-2 text-xl font-extrabold tracking-[-.055em]">내가 고른 정확한 구성으로 가격 흐름을 확인하세요.</h2>
        <p className="mt-2 text-[12px] leading-5 text-[#d2e9d6]">상품명과 옵션·용량·수량을 함께 확인한 뒤 목표가를 설정할 수 있습니다.</p>
        <Link href="/search" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-xs font-extrabold text-[#176b3a] active:scale-[.97]">가신으로 이 상품 가격 추적하기 <ArrowRight className="size-3.5" /></Link>
      </section>
    </section>
  );
}
