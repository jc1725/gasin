import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, HeartHandshake, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminUser } from "@shared/const";
import { DONATION_RATE_PCT, DONATION_STATUSES, DONATION_STATUS_LABELS, computeDonationKrw, formatKrw, type DonationStatus } from "@shared/give";
import { trpc } from "@/lib/trpc";

// 2026-10-01 리뉴얼 5단계: GASIN GIVE 기부 장부 관리자 화면(/admin/give).
// 쿠팡 파트너스 정산 입금을 확인한 뒤 발생월별로 세후 지급액·기부 내역·증빙을 입력한다.
// 기부금은 직접 입력하지 않는다 — 서버가 세후 지급액 × 기부율(원 미만 올림)로 계산한다.

type Draft = {
  earnMonth: string;
  status: DonationStatus;
  expectedPayoutDate: string;
  payoutNetKrw: string;
  payoutReceivedDate: string;
  donatedDate: string;
  recipientName: string;
  proofUrl: string;
  note: string;
  showAmounts: boolean;
  isPublished: boolean;
};

const emptyDraft: Draft = {
  earnMonth: "",
  status: "payout_pending",
  expectedPayoutDate: "",
  payoutNetKrw: "",
  payoutReceivedDate: "",
  donatedDate: "",
  recipientName: "",
  proofUrl: "",
  note: "",
  showAmounts: false,
  isPublished: false,
};

const inputClass = "min-h-10 w-full rounded-xl border border-[#d9e6d9] bg-white px-3 text-xs outline-none focus:border-[#6d9ec7]";
const labelClass = "text-[10px] font-bold text-[#45634d]";

export default function AdminGive() {
  const { user, loading } = useAuth();
  const isAdmin = isAdminUser(user);
  const utils = trpc.useUtils();
  const entries = trpc.give.adminList.useQuery(undefined, { enabled: isAdmin });
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const save = trpc.give.adminSave.useMutation({
    onSuccess: async result => {
      toast.success(result.donationKrw === null ? `${result.earnMonth} 저장했습니다.` : `${result.earnMonth} 저장했습니다. 기부금 ${formatKrw(result.donationKrw)}`);
      await Promise.all([utils.give.adminList.invalidate(), utils.give.public.invalidate()]);
      setDraft(emptyDraft);
      setEditingMonth(null);
    },
    onError: error => toast.error(error.message),
  });

  if (loading) return <p className="py-20 text-center text-sm text-[#718074]">관리자 권한을 확인하는 중입니다.</p>;
  if (!isAdmin) return <section className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-[#e2ebe1]"><ShieldOff className="mx-auto size-8 text-[#a44c45]" /><h1 className="mt-3 text-lg font-extrabold">접근 권한이 없습니다</h1><p className="mt-2 text-xs leading-5 text-[#718071]">관리자만 기부 장부를 관리할 수 있습니다.</p></section>;

  const existing = editingMonth ? entries.data?.find(entry => entry.earnMonth === editingMonth) : undefined;
  const ratePct = existing?.donationRatePct ?? DONATION_RATE_PCT;
  const payout = draft.payoutNetKrw.trim() === "" ? null : Number(draft.payoutNetKrw.replace(/[,\s]/g, ""));
  const preview = payout !== null && Number.isSafeInteger(payout) && payout >= 0 ? computeDonationKrw(payout, ratePct) : null;
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(previous => ({ ...previous, [key]: value }));

  const startEdit = (entry: NonNullable<typeof entries.data>[number]) => {
    setEditingMonth(entry.earnMonth);
    setDraft({
      earnMonth: entry.earnMonth,
      status: entry.status,
      expectedPayoutDate: entry.expectedPayoutDate ?? "",
      payoutNetKrw: entry.payoutNetKrw === null ? "" : String(entry.payoutNetKrw),
      payoutReceivedDate: entry.payoutReceivedDate ?? "",
      donatedDate: entry.donatedDate ?? "",
      recipientName: entry.recipientName ?? "",
      proofUrl: entry.proofUrl ?? "",
      note: entry.note ?? "",
      showAmounts: entry.showAmounts,
      isPublished: entry.isPublished,
    });
  };

  const submit = () => {
    if (payout !== null && (!Number.isSafeInteger(payout) || payout < 0)) return toast.error("세후 지급액은 0 이상의 정수(원)로 입력해 주세요.");
    const nullable = (value: string) => (value.trim() ? value.trim() : null);
    save.mutate({
      earnMonth: draft.earnMonth.trim(),
      status: draft.status,
      expectedPayoutDate: nullable(draft.expectedPayoutDate),
      payoutNetKrw: payout,
      payoutReceivedDate: nullable(draft.payoutReceivedDate),
      donatedDate: nullable(draft.donatedDate),
      recipientName: nullable(draft.recipientName),
      proofUrl: nullable(draft.proofUrl),
      note: nullable(draft.note),
      showAmounts: draft.showAmounts,
      isPublished: draft.isPublished,
    });
  };

  return (
    <section className="pb-6">
      <Link href="/admin" className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-[#176b3a]"><ArrowLeft className="size-3.5" />가격 관리로</Link>
      <header className="mb-5 rounded-3xl bg-[#176b3a] p-5 text-white shadow-[0_12px_30px_rgba(23,107,58,.2)]">
        <div className="flex items-center gap-2"><HeartHandshake className="size-5" /><p className="text-xs font-bold text-[#d8f0dc]">GASIN GIVE</p></div>
        <h1 className="mt-2 text-xl font-extrabold tracking-[-.05em]">기부 장부 관리</h1>
        <p className="mt-2 text-[11px] leading-5 text-[#d8f0dc]">정산 입금을 확인한 뒤 발생월별로 세후 지급액(입금액에서 부가세를 뺀 공급가액)을 입력하세요. 기부금은 지급액 × {DONATION_RATE_PCT}%를 원 미만 올림으로 자동 계산합니다. "공개"를 켠 행만 /give에 보이고, 금액은 "금액 공개"를 켰을 때만 보입니다.</p>
      </header>

      <form className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-[#e2ebe1]" onSubmit={event => { event.preventDefault(); submit(); }}>
        <h2 className="text-sm font-extrabold text-[#203425]">{editingMonth ? `${editingMonth} 수정` : "발생월 추가"}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1"><span className={labelClass}>발생월 (YYYY-MM)</span><input value={draft.earnMonth} onChange={event => update("earnMonth", event.target.value)} disabled={Boolean(editingMonth)} placeholder="2026-08" className={inputClass} /></label>
          <label className="grid gap-1"><span className={labelClass}>상태</span><select value={draft.status} onChange={event => update("status", event.target.value as DonationStatus)} className={inputClass}>{DONATION_STATUSES.map(status => <option key={status} value={status}>{DONATION_STATUS_LABELS[status]}</option>)}</select></label>
          <label className="grid gap-1"><span className={labelClass}>정산 예정일</span><input type="date" value={draft.expectedPayoutDate} onChange={event => update("expectedPayoutDate", event.target.value)} className={inputClass} /></label>
          <label className="grid gap-1"><span className={labelClass}>세후 지급액(원)</span><input inputMode="numeric" value={draft.payoutNetKrw} onChange={event => update("payoutNetKrw", event.target.value.replace(/[^0-9]/g, ""))} placeholder="입금액 − 부가세" className={inputClass} /></label>
          <label className="grid gap-1"><span className={labelClass}>입금일</span><input type="date" value={draft.payoutReceivedDate} onChange={event => update("payoutReceivedDate", event.target.value)} className={inputClass} /></label>
          <label className="grid gap-1"><span className={labelClass}>기부일</span><input type="date" value={draft.donatedDate} onChange={event => update("donatedDate", event.target.value)} className={inputClass} /></label>
          <label className="grid gap-1"><span className={labelClass}>기부처</span><input value={draft.recipientName} onChange={event => update("recipientName", event.target.value)} maxLength={200} className={inputClass} /></label>
          <label className="grid gap-1"><span className={labelClass}>증빙 주소(https)</span><input type="url" value={draft.proofUrl} onChange={event => update("proofUrl", event.target.value)} placeholder="기부 영수증·확인 페이지 링크" className={inputClass} /></label>
          <label className="grid gap-1 sm:col-span-2"><span className={labelClass}>메모(비공개)</span><input value={draft.note} onChange={event => update("note", event.target.value)} maxLength={1000} className={inputClass} /></label>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="inline-flex min-h-9 items-center gap-2 text-[11px] font-bold text-[#45634d]"><input type="checkbox" checked={draft.isPublished} onChange={event => update("isPublished", event.target.checked)} className="size-4 accent-[#176b3a]" />/give에 공개</label>
          <label className="inline-flex min-h-9 items-center gap-2 text-[11px] font-bold text-[#45634d]"><input type="checkbox" checked={draft.showAmounts} onChange={event => update("showAmounts", event.target.checked)} className="size-4 accent-[#176b3a]" />금액 공개(지급액·기부금)</label>
        </div>
        <p className="mt-2 rounded-xl bg-[#f4fbf5] px-3 py-2 text-[11px] text-[#356342]">기부금 미리보기: {preview === null ? "세후 지급액을 입력하면 계산됩니다." : `${formatKrw(preview)} (기부율 ${ratePct}%)`}</p>
        <div className="mt-3 flex gap-2">
          <button type="submit" disabled={save.isPending} className="min-h-10 flex-1 rounded-xl bg-[#176b3a] px-4 text-xs font-bold text-white disabled:opacity-50">{save.isPending ? "저장 중" : "저장"}</button>
          {editingMonth ? <button type="button" onClick={() => { setEditingMonth(null); setDraft(emptyDraft); }} className="min-h-10 rounded-xl border border-[#d9e6d9] px-4 text-xs font-bold text-[#58735e]">취소</button> : null}
        </div>
      </form>

      <section className="mt-5 space-y-3" aria-label="기부 장부 목록">
        {entries.isLoading ? <p className="py-8 text-center text-xs text-[#718071]">장부를 불러오는 중입니다.</p> : null}
        {entries.error ? <p className="rounded-2xl bg-[#fdeceb] p-4 text-xs text-[#a44c45]">장부를 불러오지 못했습니다. 기부 장부 테이블(마이그레이션 0043)이 적용됐는지 확인해 주세요.</p> : null}
        {entries.data?.length === 0 ? <p className="rounded-2xl bg-white p-4 text-center text-xs text-[#718071] ring-1 ring-[#e2ebe1]">아직 등록된 발생월이 없습니다.</p> : null}
        {entries.data?.map(entry => (
          <article key={entry.earnMonth} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#e2ebe1]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-[#203425]">{entry.earnMonth} · {DONATION_STATUS_LABELS[entry.status]}</h3>
                <p className="mt-1 text-[11px] text-[#5d6d60]">세후 지급액 {entry.payoutNetKrw === null ? "-" : formatKrw(entry.payoutNetKrw)} · 기부금 {entry.donationKrw === null ? "-" : formatKrw(entry.donationKrw)} ({entry.donationRatePct}%)</p>
                <p className="mt-1 text-[10px] text-[#829184]">정산 예정 {entry.expectedPayoutDate ?? "-"} · 입금 {entry.payoutReceivedDate ?? "-"} · 기부 {entry.donatedDate ?? "-"} · {entry.recipientName ?? "기부처 미정"}</p>
                <p className="mt-1 text-[10px] font-bold text-[#45634d]">{entry.isPublished ? "공개" : "비공개"} · {entry.showAmounts ? "금액 공개" : "금액 비공개"}</p>
              </div>
              <button type="button" onClick={() => startEdit(entry)} className="min-h-9 shrink-0 rounded-xl border border-[#b9d8c0] bg-white px-3 text-[10px] font-bold text-[#176b3a]">수정</button>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}
