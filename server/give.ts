import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { DONATION_RATE_PCT, DONATION_STATUSES, computeDonationKrw, type DonationStatus, type PublicDonationEntry } from "@shared/give";
import * as db from "./db";

// 2026-10-01 리뉴얼 5단계: GASIN GIVE 기부 장부.
//
// - 금액은 관리자가 쿠팡 파트너스 정산 입금을 확인한 뒤 입력한다(자동 수집 경로 없음).
// - 기부금은 사람이 입력하지 않고 세후 지급액 × 행의 기부율로 서버가 계산한다.
// - 상태를 올릴 때 필요한 값이 없으면 저장을 거부한다(빈 칸인 채 "기부 완료"가 되지 않게).
// - 공개 화면에는 isPublished 행만, 금액은 showAmounts가 켜졌고 지급 이후일 때만 보낸다.

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const optionalDate = z.string().trim().regex(DATE, "날짜는 YYYY-MM-DD 형식이어야 합니다.").nullable();
const optionalText = (max: number) => z.string().trim().max(max).nullable().transform(value => (value ? value : null));

export const donationLedgerInput = z
  .object({
    earnMonth: z.string().trim().regex(MONTH, "발생월은 YYYY-MM 형식이어야 합니다."),
    status: z.enum(DONATION_STATUSES),
    expectedPayoutDate: optionalDate,
    // 쿠팡 파트너스 월 지급 상한(3,000만 원)보다 넉넉하게 둔다.
    payoutNetKrw: z.number().int().min(0).max(100_000_000).nullable(),
    payoutReceivedDate: optionalDate,
    donatedDate: optionalDate,
    recipientName: optionalText(200),
    proofUrl: z.string().trim().url("증빙 주소가 올바르지 않습니다.").max(2000).refine(value => value.startsWith("https://"), "증빙 주소는 https로 시작해야 합니다.").nullable(),
    note: optionalText(1000),
    showAmounts: z.boolean(),
    isPublished: z.boolean(),
  })
  .strict();

export type DonationLedgerInput = z.infer<typeof donationLedgerInput>;

/** 상태별 필수값 확인. 문제가 있으면 사람이 읽을 메시지를 돌려준다. */
export function findDonationLedgerProblem(input: DonationLedgerInput): string | null {
  const reached = (status: DonationStatus) => DONATION_STATUSES.indexOf(input.status) >= DONATION_STATUSES.indexOf(status);
  if (reached("paid")) {
    if (input.payoutNetKrw === null) return "지급 완료 이후 상태에는 세후 지급액이 필요합니다.";
    if (!input.payoutReceivedDate) return "지급 완료 이후 상태에는 입금일이 필요합니다.";
  }
  if (reached("donated")) {
    if (!input.donatedDate) return "기부 완료 상태에는 기부일이 필요합니다.";
    if (!input.recipientName) return "기부 완료 상태에는 기부처가 필요합니다.";
    if (!input.proofUrl) return "기부 완료 상태에는 증빙 주소가 필요합니다.";
  }
  if (input.showAmounts && input.payoutNetKrw === null) return "금액을 공개하려면 세후 지급액이 필요합니다.";
  return null;
}

export async function saveDonationLedgerEntry(input: DonationLedgerInput, adminUserId: number) {
  const problem = findDonationLedgerProblem(input);
  if (problem) throw new TRPCError({ code: "BAD_REQUEST", message: problem });
  const existing = await db.getDonationLedgerEntry(input.earnMonth);
  const ratePct = existing?.donationRatePct ?? DONATION_RATE_PCT;
  const donationKrw = input.payoutNetKrw === null ? null : computeDonationKrw(input.payoutNetKrw, ratePct);
  await db.upsertDonationLedgerEntry({ ...input, donationRatePct: ratePct, donationKrw, updatedByUserId: adminUserId });
  return { earnMonth: input.earnMonth, donationRatePct: ratePct, donationKrw };
}

type LedgerRow = Awaited<ReturnType<typeof db.listDonationLedgerEntries>>[number];

export function toPublicDonationEntry(row: LedgerRow): PublicDonationEntry {
  const afterPayout = row.status === "paid" || row.status === "donated";
  const amounts = row.showAmounts && afterPayout && row.payoutNetKrw !== null && row.donationKrw !== null
    ? { payoutNetKrw: row.payoutNetKrw, donationRatePct: row.donationRatePct, donationKrw: row.donationKrw }
    : null;
  return {
    earnMonth: row.earnMonth,
    status: row.status,
    expectedPayoutDate: row.expectedPayoutDate,
    donatedDate: row.status === "donated" ? row.donatedDate : null,
    recipientName: row.status === "donated" ? row.recipientName : null,
    proofUrl: row.status === "donated" ? row.proofUrl : null,
    amounts,
  };
}

export async function listPublicDonationEntries(): Promise<PublicDonationEntry[]> {
  try {
    const rows = await db.listDonationLedgerEntries();
    return rows.filter(row => row.isPublished).map(toPublicDonationEntry);
  } catch (error) {
    // 마이그레이션(drizzle/0043) 적용 전이면 테이블이 없다. 공개 화면은 기본 안내로 대신한다.
    console.warn("[Give] 기부 장부 조회 실패:", error instanceof Error ? error.message : error);
    return [];
  }
}
