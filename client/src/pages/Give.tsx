import { ArrowRight, CalendarClock, HeartHandshake, ReceiptText, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import {
  DONATION_RATE_PCT,
  FIRST_PAYOUT_EXPECTED,
  GIVE_BASIS_DETAIL,
  GIVE_NO_EXTRA_COST,
  GIVE_PROMISE,
  PARTNERS_DISCLOSURE,
  describePayoutStatus,
  formatDateKo,
  formatEarnMonthKo,
} from "@shared/give";

// 2026-10-01 리뉴얼 1단계: GASIN GIVE 최소 페이지. 기부 기준과 정산 일정은 확정된
// 내용(세후 기준, 30%, 쿠팡 파트너스 운영정책 5의 지급 일정)만 적는다. 월별 내역은
// 5단계 관리자 장부(donationLedger)가 생기면 데이터로 바꾼다.
const basisItems = [
  { Icon: HeartHandshake, title: `기부율 ${DONATION_RATE_PCT}%`, body: GIVE_PROMISE },
  { Icon: ReceiptText, title: "세후 금액 기준", body: GIVE_BASIS_DETAIL },
  { Icon: CalendarClock, title: "실제 지급 후 계산", body: "쿠팡 파트너스 수익은 발생한 달의 다음다음 달 15일에 지급됩니다. 취소·반품된 금액은 지급액에서 빠지므로, 예상 수익이 아니라 실제로 지급받은 금액으로 기부금을 계산합니다." },
  { Icon: ShieldCheck, title: "개인별 기부액은 표시하지 않습니다", body: "가신은 어떤 구매가 어떤 이용자의 것인지 알 수 없습니다. 그래서 개인별 기부 금액을 계산하거나 표시하지 않습니다." },
] as const;

export default function Give() {
  const status = describePayoutStatus(FIRST_PAYOUT_EXPECTED.expectedDate);
  return (
    <section className="pb-5">
      <div className="relative overflow-hidden rounded-3xl bg-[#176b3a] px-6 py-8 text-white shadow-[0_18px_42px_rgba(23,107,58,.2)]">
        <div className="absolute -right-10 -top-12 size-44 rounded-full border-[20px] border-white/10" />
        <div className="relative">
          <p className="text-[11px] font-extrabold tracking-[.12em] text-[#d8f0dc]">GASIN GIVE</p>
          <h1 className="mt-2 text-[27px] font-extrabold tracking-[-.06em]">가신의 기부 기준과 내역</h1>
          <p className="mt-3 max-w-[32rem] text-sm leading-6 text-[#d8f0dc]">{GIVE_PROMISE} {GIVE_NO_EXTRA_COST}</p>
        </div>
      </div>

      <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-[11px] leading-5 text-[#708075] shadow-sm ring-1 ring-[#e2ebe1]">{PARTNERS_DISCLOSURE}</p>

      <div className="mt-5 space-y-3">
        {basisItems.map(({ Icon, title, body }) => (
          <article key={title} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#e2ebe1]">
            <div className="flex gap-3">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e5f2e7] text-[#176b3a]"><Icon className="size-4" /></span>
              <div>
                <h2 className="text-[16px] font-extrabold leading-6 tracking-[-.045em] text-[#203425]">{title}</h2>
                <p className="mt-2 text-[13px] leading-6 text-[#5d6d60]">{body}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <section aria-labelledby="give-history-title" className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#e2ebe1]">
        <p className="text-[10px] font-extrabold tracking-[.12em] text-[#308154]">MONTHLY RECORD</p>
        <h2 id="give-history-title" className="mt-1 text-[17px] font-extrabold tracking-[-.045em] text-[#203425]">월별 기부 내역</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[18rem] text-left text-[12px]">
            <thead>
              <tr className="border-b border-[#e3ece4] text-[11px] text-[#6b7d6f]">
                <th scope="col" className="py-2 pr-3 font-bold">발생월</th>
                <th scope="col" className="py-2 pr-3 font-bold">정산 예정일</th>
                <th scope="col" className="py-2 font-bold">상태</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-3 pr-3 font-bold text-[#203425]">{formatEarnMonthKo(FIRST_PAYOUT_EXPECTED.earnMonth)}</td>
                <td className="py-3 pr-3 text-[#5d6d60]">{formatDateKo(FIRST_PAYOUT_EXPECTED.expectedDate)}</td>
                <td className="py-3"><span className="rounded-full bg-[#fffaf0] px-2 py-1 text-[11px] font-bold text-[#94601a] ring-1 ring-[#ecd09f]">{status}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-[#708075]">실제 지급과 기부가 끝나면 기부일과 기부처, 증빙을 이 표에 공개합니다.</p>
      </section>

      <section aria-label="가격 확인으로 돌아가기" className="mt-6 rounded-3xl bg-[#1e5130] p-5 text-white shadow-[0_14px_32px_rgba(23,107,58,.18)]">
        <p className="text-[10px] font-extrabold tracking-[.12em] text-[#bfe0c5]">쿠팡 가기 전, 가신 한번.</p>
        <h2 className="mt-2 text-xl font-extrabold tracking-[-.055em]">사기 전에 가격 흐름부터 확인하세요.</h2>
        <Link href="/search" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-xs font-extrabold text-[#176b3a] active:scale-[.97]">쿠팡 상품 가격 검색하기 <ArrowRight className="size-3.5" /></Link>
      </section>
    </section>
  );
}
