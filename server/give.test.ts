import { beforeEach, describe, expect, it, vi } from "vitest";

const { listDonationLedgerEntries, getDonationLedgerEntry, upsertDonationLedgerEntry } = vi.hoisted(() => ({
  listDonationLedgerEntries: vi.fn(),
  getDonationLedgerEntry: vi.fn(),
  upsertDonationLedgerEntry: vi.fn(),
}));
vi.mock("./db", () => ({ listDonationLedgerEntries, getDonationLedgerEntry, upsertDonationLedgerEntry }));

import { computeDonationKrw } from "../shared/give";
import { donationLedgerInput, findDonationLedgerProblem, listPublicDonationEntries, saveDonationLedgerEntry, toPublicDonationEntry, type DonationLedgerInput } from "./give";

const base: DonationLedgerInput = {
  earnMonth: "2026-08",
  status: "payout_pending",
  expectedPayoutDate: "2026-10-15",
  payoutNetKrw: null,
  payoutReceivedDate: null,
  donatedDate: null,
  recipientName: null,
  proofUrl: null,
  note: null,
  showAmounts: false,
  isPublished: true,
};

type LedgerRow = Parameters<typeof toPublicDonationEntry>[0];
const row = (overrides: Partial<LedgerRow> = {}): LedgerRow => ({
  id: 1,
  earnMonth: "2026-08",
  status: "donated",
  expectedPayoutDate: "2026-10-15",
  payoutNetKrw: 1_000_001,
  payoutReceivedDate: "2026-10-15",
  donationRatePct: 30,
  donationKrw: 300_001,
  donatedDate: "2026-10-20",
  recipientName: "기부처",
  proofUrl: "https://example.org/receipt",
  note: "비공개 메모",
  showAmounts: true,
  isPublished: true,
  updatedByUserId: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("GASIN GIVE 기부 장부 (리뉴얼 5단계)", () => {
  beforeEach(() => {
    listDonationLedgerEntries.mockReset();
    getDonationLedgerEntry.mockReset();
    upsertDonationLedgerEntry.mockReset();
  });

  it("기부금은 세후 지급액 × 기부율을 원 미만 올림한다", () => {
    expect(computeDonationKrw(1_000_000, 30)).toBe(300_000);
    expect(computeDonationKrw(1_000_001, 30)).toBe(300_001);
    expect(computeDonationKrw(1, 30)).toBe(1);
    expect(computeDonationKrw(0, 30)).toBe(0);
  });

  it("상태를 올릴 때 필요한 값이 없으면 저장을 거부한다", () => {
    expect(findDonationLedgerProblem(base)).toBeNull();
    expect(findDonationLedgerProblem({ ...base, status: "paid" })).toContain("세후 지급액");
    expect(findDonationLedgerProblem({ ...base, status: "paid", payoutNetKrw: 1000 })).toContain("입금일");
    const paid = { ...base, status: "paid" as const, payoutNetKrw: 1000, payoutReceivedDate: "2026-10-15" };
    expect(findDonationLedgerProblem(paid)).toBeNull();
    expect(findDonationLedgerProblem({ ...paid, status: "donated" })).toContain("기부일");
    expect(findDonationLedgerProblem({ ...paid, status: "donated", donatedDate: "2026-10-20", recipientName: "기부처" })).toContain("증빙");
    expect(findDonationLedgerProblem({ ...base, showAmounts: true })).toContain("금액을 공개");
  });

  it("입력 검증: 발생월·날짜 형식, https 증빙만 허용, 알 수 없는 필드 거부", () => {
    expect(donationLedgerInput.safeParse(base).success).toBe(true);
    expect(donationLedgerInput.safeParse({ ...base, earnMonth: "2026-13" }).success).toBe(false);
    expect(donationLedgerInput.safeParse({ ...base, expectedPayoutDate: "10/15" }).success).toBe(false);
    expect(donationLedgerInput.safeParse({ ...base, proofUrl: "http://example.org" }).success).toBe(false);
    expect(donationLedgerInput.safeParse({ ...base, donationKrw: 1 }).success).toBe(false);
  });

  it("기존 행은 처음 기부율 스냅샷을 유지하고, 기부금은 서버가 계산해 저장한다", async () => {
    getDonationLedgerEntry.mockResolvedValueOnce(row({ donationRatePct: 25 }));
    const input = { ...base, status: "paid" as const, payoutNetKrw: 1_000_000, payoutReceivedDate: "2026-10-15" };
    await expect(saveDonationLedgerEntry(input, 7)).resolves.toEqual({ earnMonth: "2026-08", donationRatePct: 25, donationKrw: 250_000 });
    expect(upsertDonationLedgerEntry).toHaveBeenCalledWith(expect.objectContaining({ donationRatePct: 25, donationKrw: 250_000, updatedByUserId: 7 }));
  });

  it("공개 화면: 비공개 행·메모는 숨기고, 금액은 금액 공개 + 지급 이후일 때만 내보낸다", async () => {
    listDonationLedgerEntries.mockResolvedValueOnce([row(), row({ earnMonth: "2026-09", isPublished: false })]);
    const entries = await listPublicDonationEntries();
    expect(entries.map(entry => entry.earnMonth)).toEqual(["2026-08"]);
    expect(JSON.stringify(entries)).not.toContain("비공개 메모");
    expect(entries[0]!.amounts).toEqual({ payoutNetKrw: 1_000_001, donationRatePct: 30, donationKrw: 300_001 });
    expect(toPublicDonationEntry(row({ showAmounts: false })).amounts).toBeNull();
    const pending = toPublicDonationEntry(row({ status: "payout_pending", donatedDate: null }));
    expect(pending.amounts).toBeNull();
    expect(pending.recipientName).toBeNull();
  });

  it("장부 테이블이 없으면(마이그레이션 전) 공개 목록은 빈 배열로 대신한다", async () => {
    listDonationLedgerEntries.mockRejectedValueOnce(new Error("Table 'donationLedger' doesn't exist"));
    await expect(listPublicDonationEntries()).resolves.toEqual([]);
  });
});
