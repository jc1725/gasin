import { ArrowRight, HeartHandshake } from "lucide-react";
import { Link } from "wouter";
import { GIVE_PATH } from "@shared/give";

// 2026-10-01 리뉴얼 4단계: 나의 착한경유. 회원 본인 화면(/favorites)에만 둔다.
// - 개인별 구매·수익 귀속을 알 수 없으므로 금액은 보여 주지 않고 행동 횟수만 보여 준다(기획안 12항).
// - 이동 횟수는 "하루 한 상품 1회"로 센 값이다(goodViaEvents 유니크).
// - 클릭 수는 쿠팡 파트너스 운영정책 4.1 4)상 공개 불가 정보와 성격이 같아, 본인에게만 보여 준다.
export type MyGoodViaCardProps = {
  /** "YYYY-MM". 아직 불러오는 중이면 undefined. */
  month?: string;
  /** 이번 달 쿠팡 이동 횟수. 불러오는 중이면 undefined. */
  moveCount?: number;
  /** 목표가를 설정한 찜 상품 수. 불러오는 중이면 undefined. */
  alertCount?: number;
  /** 기록을 불러오지 못했으면 false(예: 서버 일시 오류). */
  available?: boolean;
};

function formatMonth(month?: string) {
  if (!month) return "이번 달";
  return `${Number(month.slice(5, 7))}월`;
}

export default function MyGoodViaCard({ month, moveCount, alertCount, available = true }: MyGoodViaCardProps) {
  const isLoading = moveCount === undefined;
  const monthLabel = formatMonth(month);
  const summary = !available
    ? "지금은 이동 기록을 불러오지 못했어요. 잠시 후 다시 확인해 주세요."
    : isLoading
      ? "이동 기록을 불러오는 중이에요."
      : moveCount === 0
        ? `${monthLabel}에는 아직 가신을 거쳐 쿠팡으로 이동한 기록이 없어요.`
        : `${monthLabel}에 착한경유로 쿠팡에 ${moveCount}번 이동했어요.`;

  return (
    <section aria-labelledby="my-good-via-title" aria-busy={isLoading} className="mb-5 rounded-2xl border border-[#cce4d1] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e5f2e7] text-[#176b3a]"><HeartHandshake className="size-4" /></span>
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold tracking-[.12em] text-[#308154]">MY GOOD VIA</p>
          <h2 id="my-good-via-title" className="text-sm font-extrabold tracking-[-.04em] text-[#203425]">나의 착한경유</h2>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-[#f2f8f3] p-3">
          <dt className="text-[10px] font-bold text-[#5e7564]">{monthLabel} 쿠팡 이동</dt>
          <dd className="mt-1 text-lg font-extrabold text-[#176b3a]">{available && !isLoading ? moveCount : "…"}<span className="ml-1 text-[10px] text-[#638069]">회</span></dd>
        </div>
        <div className="rounded-xl bg-[#f2f8f3] p-3">
          <dt className="text-[10px] font-bold text-[#5e7564]">목표가 알림</dt>
          <dd className="mt-1 text-lg font-extrabold text-[#176b3a]">{alertCount ?? "…"}<span className="ml-1 text-[10px] text-[#638069]">개</span></dd>
        </div>
      </dl>
      <p className="mt-3 text-[12px] leading-5 text-[#55705c]" aria-live="polite">{summary}</p>
      <p className="mt-1 text-[10px] leading-4 text-[#829184]">같은 상품은 하루 한 번만 셉니다. 가신은 누가 무엇을 샀는지 알 수 없어 개인별 기부 금액은 보여 드리지 않아요.</p>
      <Link href={GIVE_PATH} className="mt-1 inline-flex min-h-11 items-center gap-1 text-[11px] font-extrabold text-[#176b3a]">기부 기준과 내역 보기 <ArrowRight className="size-3.5" /></Link>
    </section>
  );
}
