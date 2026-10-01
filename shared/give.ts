// 2026-10-01: 착한경유·GASIN GIVE 문구와 기부 기준을 한 곳에서 관리한다.
//
// - 기부 기준은 "세후"(인환님 결정): 쿠팡 파트너스에서 실제 입금된 금액에서 부가세를
//   뺀 금액(= 사업자 회원 역발행 세금계산서의 공급가액)이다.
// - 쿠팡 파트너스 운영정책 4.1 2)(클릭유도 문구)·4.1 8)(클릭 유도 레이어) 때문에,
//   기부를 클릭·이동 행위에 묶는 표현("클릭하면 기부" 등)은 쓰지 않고 회사 정책이라는
//   사실로만 서술한다. 금지 표현은 아래 GIVE_FORBIDDEN_PHRASES로 테스트가 막는다
//   (server/giveCopy.test.ts).
export const DONATION_RATE_PCT = 30;
export const GIVE_PATH = "/give";

export const GIVE_PROMISE = `가신은 실제 지급받은 쿠팡 파트너스 수익금(세후)의 ${DONATION_RATE_PCT}%를 기부합니다.`;
export const GIVE_NO_EXTRA_COST = "구매자가 추가로 부담하는 금액은 없습니다.";
export const GIVE_BASIS_DETAIL = "세후 금액은 쿠팡 파트너스에서 실제 입금된 금액에서 부가세를 뺀 금액(세금계산서 공급가액)입니다.";
export const PARTNERS_DISCLOSURE = "가신 링크 제품 구매시 쿠팡파트너스 활동의 일환으로 일정액의 수수료를 제공받습니다.";

// 임시 값: 첫 정산 예정. 5단계(관리자 기부 장부, donationLedger)에서 DB 값으로 대체되면 삭제한다.
// 쿠팡 파트너스 운영정책 5: 사업자 회원은 발생월의 익익월 15일에 지급(8월 발생분 → 10월 15일).
export const FIRST_PAYOUT_EXPECTED = { earnMonth: "2026-08", expectedDate: "2026-10-15" } as const;

// 사이트 어디에도 쓰면 안 되는 표현. 개인별 기부 귀속을 알 수 없고(기획안 12·17항),
// 구매·클릭에 기부를 묶으면 클릭유도 문구로 볼 소지가 있다(운영정책 4.1 2)).
export const GIVE_FORBIDDEN_PHRASES = [
  "구매금액의 30%",
  "구매 금액의 30%",
  "구매금액 중 30%",
  "구매하면 30%",
  "구매하면 기부",
  "클릭하면 기부",
  "클릭만으로",
  "방문만으로",
  "기부했습니다",
  "기부되었습니다",
] as const;

export function formatEarnMonthKo(earnMonth: string) {
  const [year, month] = earnMonth.split("-").map(Number);
  return `${year}년 ${month}월`;
}

export function formatDateKo(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

// 예정일(한국 시간) 당일이 지나면 "정산 대기" 대신 "정산 확인 중"으로 보여 준다.
// 실제 입금 확인은 5단계 관리자 장부에서 하므로, 그 전까지는 확정 표현을 쓰지 않는다.
export function describePayoutStatus(expectedDate: string, now: Date = new Date()) {
  const dayAfterExpected = Date.parse(`${expectedDate}T00:00:00+09:00`) + 24 * 60 * 60 * 1000;
  return now.getTime() >= dayAfterExpected ? "정산 확인 중" : "정산 대기";
}

// ============================================================
// 2026-10-01 리뉴얼 5단계: 기부 장부(donationLedger) 공통 규칙
// ------------------------------------------------------------
export const DONATION_STATUSES = ["accruing", "payout_pending", "paid", "donated"] as const;
export type DonationStatus = (typeof DONATION_STATUSES)[number];

export const DONATION_STATUS_LABELS: Record<DonationStatus, string> = {
  accruing: "수익 발생 중",
  payout_pending: "정산 대기",
  paid: "지급 완료 · 기부 준비 중",
  donated: "기부 완료",
};

/** 기부금 = 세후 지급액 × 기부율, 원 미만 올림(30%를 한 번도 밑돌지 않게). 정수 연산만 쓴다. */
export function computeDonationKrw(payoutNetKrw: number, ratePct: number) {
  return Math.ceil((payoutNetKrw * ratePct) / 100);
}

export function formatKrw(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

/** 공개 화면에 내보내는 장부 한 줄. 금액은 showAmounts가 켜졌고 지급 이후 상태일 때만 담긴다. */
export type PublicDonationEntry = {
  earnMonth: string;
  status: DonationStatus;
  expectedPayoutDate: string | null;
  donatedDate: string | null;
  recipientName: string | null;
  proofUrl: string | null;
  amounts: { payoutNetKrw: number; donationRatePct: number; donationKrw: number } | null;
};
