import { ArrowRight, CalendarClock, HeartHandshake, ReceiptText, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  DONATION_RATE_PCT,
  DONATION_STATUS_LABELS,
  FIRST_PAYOUT_EXPECTED,
  GIVE_BASIS_DETAIL,
  GIVE_NO_EXTRA_COST,
  GIVE_PROMISE,
  PARTNERS_DISCLOSURE,
  describePayoutStatus,
  formatDateKo,
  formatEarnMonthKo,
  formatKrw,
  type PublicDonationEntry,
} from "@shared/give";

// 2026-10-01 리뉴얼 1단계: GASIN GIVE 페이지. 기부 기준과 정산 일정은 확정된 내용(세후 기준,
// 30%, 쿠팡 파트너스 운영정책 5의 지급 일정)만 적는다. 5단계부터 월별 내역은 관리자 장부
// (donationLedger, /admin/give)의 공개 행을 보여 준다.
const basisItems = [
  { Icon: HeartHandshake, title: `기부율 ${DONATION_RATE_PCT}%`, body: GIVE_PROMISE },
  { Icon: ReceiptText, title: "세후 금액 기준", body: GIVE_BASIS_DETAIL },
  { Icon: CalendarClock, title: "실제 지급 후 계산", body: "쿠팡 파트너스 수익은 발생한 달의 다음다음 달 15일에 지급됩니다. 취소·반품된 금액은 지급액에서 빠지므로, 예상 수익이 아니라 실제로 지급받은 금액으로 기부금을 계산합니다." },
  { Icon: ShieldCheck, title: "개인별 기부액은 표시하지 않습니다", body: "가신은 어떤 구매가 어떤 이용자의 것인지 알 수 없습니다. 그래서 개인별 기부 금액을 계산하거나 표시하지 않습니다." },
] as const;

// 2026-10-01 리뉴얼 5단계: 공개된 장부가 아직 없으면(첫 정산 전·마이그레이션 전) 첫 정산 예정 행을 대신 보여 준다.
const fallbackEntry: PublicDonationEntry = {
  earnMonth: FIRST_PAYOUT_EXPECTED.earnMonth,
  status: "payout_pending",
  expectedPayoutDate: FIRST_PAYOUT_EXPECTED.expectedDate,
  donatedDate: null,
  recipientName: null,
  proofUrl: null,
  amounts: null,
};

function statusLabel(entry: PublicDonationEntry) {
  if (entry.status === "payout_pending" && entry.expectedPayoutDate) return describePayoutStatus(entry.expectedPayoutDate);
  return DONATION_STATUS_LABELS[entry.status];
}

function GiveHistoryItem({ entry }: { entry: PublicDonationEntry }) {
  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-extrabold text-[#203425]">{formatEarnMonthKo(entry.earnMonth)} 발생분</p>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ring-1 ${entry.status === "donated" ? "bg-[#eef8f0] text-[#176b3a] ring-[#cce4d1]" : "bg-[#fffaf0] text-[#94601a] ring-[#ecd09f]"}`}>{statusLabel(entry)}</span>
      </div>
      {entry.status !== "donated" && entry.expectedPayoutDate ? <p className="mt-1 text-[12px] text-[#5d6d60]">정산 예정일 {formatDateKo(entry.expectedPayoutDate)}</p> : null}
      {entry.amounts ? <p className="mt-1 text-[12px] text-[#5d6d60]">세후 지급액 {formatKrw(entry.amounts.payoutNetKrw)} × {entry.amounts.donationRatePct}% = <strong className="text-[#176b3a]">기부금 {formatKrw(entry.amounts.donationKrw)}</strong></p> : null}
      {entry.status === "donated" ? (
        <p className="mt-1 text-[12px] text-[#5d6d60]">
          {entry.donatedDate ? `${formatDateKo(entry.donatedDate)} · ` : ""}{entry.recipientName ?? ""}
          {entry.proofUrl ? <a href={entry.proofUrl} target="_blank" rel="noopener noreferrer" className="ml-2 font-bold text-[#176b3a] underline-offset-2 hover:underline">증빙 보기</a> : null}
        </p>
      ) : null}
    </li>
  );
}

export default function Give() {
  const history = trpc.give.public.useQuery();
  const entries = history.data && history.data.length > 0 ? history.data : [fallbackEntry];
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
        {history.isLoading ? <p className="mt-3 text-[12px] text-[#708075]">기부 내역을 불러오는 중입니다.</p> : (
          <ul className="mt-3 divide-y divide-[#e3ece4]">
            {entries.map(entry => <GiveHistoryItem key={entry.earnMonth} entry={entry} />)}
          </ul>
        )}
        <p className="mt-3 text-[11px] leading-5 text-[#708075]">실제 지급과 기부가 끝나면 기부일과 기부처, 증빙을 이 목록에 공개합니다.</p>
      </section>

      <section aria-label="가격 확인으로 돌아가기" className="mt-6 rounded-3xl bg-[#1e5130] p-5 text-white shadow-[0_14px_32px_rgba(23,107,58,.18)]">
        <p className="text-[10px] font-extrabold tracking-[.12em] text-[#bfe0c5]">쿠팡 가기 전, 가신 한번.</p>
        <h2 className="mt-2 text-xl font-extrabold tracking-[-.055em]">사기 전에 가격 흐름부터 확인하세요.</h2>
        <Link href="/search" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-xs font-extrabold text-[#176b3a] active:scale-[.97]">쿠팡 상품 가격 검색하기 <ArrowRight className="size-3.5" /></Link>
      </section>
    </section>
  );
}
