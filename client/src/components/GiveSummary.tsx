import { ArrowRight, HeartHandshake } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  DONATION_RATE_PCT,
  DONATION_STATUS_LABELS,
  FIRST_PAYOUT_EXPECTED,
  GIVE_NO_EXTRA_COST,
  GIVE_PATH,
  GIVE_PROMISE,
  PARTNERS_DISCLOSURE,
  describePayoutStatus,
  formatDateKo,
  formatEarnMonthKo,
  formatKrw,
} from "@shared/give";

// 2026-10-01 리뉴얼 1단계: 홈의 GASIN GIVE 요약 카드. 지급 전에는 상태와 예정일만 보여 준다.
// 5단계부터 관리자 장부(donationLedger)의 최신 공개 행을 쓰고, 금액은 관리자가 "금액 공개"를
// 켠 기부 완료 행에서만 보인다(server/give.ts toPublicDonationEntry).
export default function GiveSummary() {
  // 2026-10-01 리뉴얼 5단계: 공개된 장부의 최신 행을 보여 주고, 없으면 첫 정산 예정으로 대신한다.
  const history = trpc.give.public.useQuery();
  const latest = history.data?.[0];
  const earnMonth = latest?.earnMonth ?? FIRST_PAYOUT_EXPECTED.earnMonth;
  const expectedDate = latest ? latest.expectedPayoutDate : FIRST_PAYOUT_EXPECTED.expectedDate;
  const status = !latest || (latest.status === "payout_pending" && latest.expectedPayoutDate)
    ? describePayoutStatus(expectedDate ?? FIRST_PAYOUT_EXPECTED.expectedDate)
    : DONATION_STATUS_LABELS[latest.status];
  const secondLabel = latest?.status === "donated" ? (latest.amounts ? "기부금" : "기부일") : "정산 예정일";
  const secondValue = latest?.status === "donated"
    ? (latest.amounts ? formatKrw(latest.amounts.donationKrw) : latest.donatedDate ? formatDateKo(latest.donatedDate) : "-")
    : expectedDate ? formatDateKo(expectedDate) : "-";
  return (
    <section aria-labelledby="gasin-give-title" className="mt-5 rounded-3xl border border-[#cce4d1] bg-[#eef8f0] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold tracking-[.12em] text-[#308154]">GASIN GIVE</p>
          <h2 id="gasin-give-title" className="mt-1 text-base font-extrabold tracking-[-.04em] text-[#176b3a]">파트너스 수익금의 {DONATION_RATE_PCT}%를 기부합니다</h2>
        </div>
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-[#176b3a]"><HeartHandshake className="size-4" /></span>
      </div>
      <p className="mt-2 text-[12px] leading-5 text-[#55705c]">{GIVE_PROMISE} {GIVE_NO_EXTRA_COST}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white p-3">
          <dt className="text-[10px] font-bold text-[#5e7564]">{formatEarnMonthKo(earnMonth)} 발생분</dt>
          <dd className="mt-1 text-sm font-extrabold text-[#176b3a]">{status}</dd>
        </div>
        <div className="rounded-2xl bg-white p-3">
          <dt className="text-[10px] font-bold text-[#5e7564]">{secondLabel}</dt>
          <dd className="mt-1 text-sm font-extrabold text-[#176b3a]">{secondValue}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] leading-5 text-[#708075]">실제 지급과 기부가 끝나면 기부 내역을 공개합니다.</p>
      <Link href={GIVE_PATH} className="mt-1 inline-flex min-h-11 items-center gap-1 text-[11px] font-extrabold text-[#176b3a]">기부 기준과 내역 보기 <ArrowRight className="size-3.5" /></Link>
      <p className="text-[10px] leading-4 text-[#829184]">{PARTNERS_DISCLOSURE}</p>
    </section>
  );
}
