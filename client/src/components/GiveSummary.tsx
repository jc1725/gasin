import { ArrowRight, HeartHandshake } from "lucide-react";
import { Link } from "wouter";
import {
  DONATION_RATE_PCT,
  FIRST_PAYOUT_EXPECTED,
  GIVE_NO_EXTRA_COST,
  GIVE_PATH,
  GIVE_PROMISE,
  PARTNERS_DISCLOSURE,
  describePayoutStatus,
  formatDateKo,
  formatEarnMonthKo,
} from "@shared/give";

// 2026-10-01 리뉴얼 1단계: 홈의 GASIN GIVE 요약 카드. 금액은 표시하지 않는다 —
// 실제 지급·기부가 끝나기 전에는 상태와 예정일만 보여 주고, 금액·기부처는 5단계
// 관리자 장부(donationLedger)가 생긴 뒤 데이터로 채운다.
export default function GiveSummary() {
  const status = describePayoutStatus(FIRST_PAYOUT_EXPECTED.expectedDate);
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
          <dt className="text-[10px] font-bold text-[#5e7564]">{formatEarnMonthKo(FIRST_PAYOUT_EXPECTED.earnMonth)} 발생분</dt>
          <dd className="mt-1 text-sm font-extrabold text-[#176b3a]">{status}</dd>
        </div>
        <div className="rounded-2xl bg-white p-3">
          <dt className="text-[10px] font-bold text-[#5e7564]">정산 예정일</dt>
          <dd className="mt-1 text-sm font-extrabold text-[#176b3a]">{formatDateKo(FIRST_PAYOUT_EXPECTED.expectedDate)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] leading-5 text-[#708075]">실제 지급과 기부가 끝나면 기부 내역을 공개합니다.</p>
      <Link href={GIVE_PATH} className="mt-1 inline-flex min-h-11 items-center gap-1 text-[11px] font-extrabold text-[#176b3a]">기부 기준과 내역 보기 <ArrowRight className="size-3.5" /></Link>
      <p className="text-[10px] leading-4 text-[#829184]">{PARTNERS_DISCLOSURE}</p>
    </section>
  );
}
