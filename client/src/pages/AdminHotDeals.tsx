import { useState } from "react";
import { Link } from "wouter";
import { CalendarClock, ExternalLink, Flame, Pencil, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminUser } from "@shared/const";
import { trpc } from "@/lib/trpc";

type Draft = {
  title: string;
  storeName: string;
  description: string;
  imageUrl: string;
  purchaseUrl: string;
  regularPrice: string;
  salePrice: string;
  sortOrder: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

type DraftTextField = Exclude<keyof Draft, "isActive">;

const emptyDraft: Draft = {
  title: "",
  storeName: "스마트스토어",
  description: "",
  imageUrl: "",
  purchaseUrl: "",
  regularPrice: "",
  salePrice: "",
  sortOrder: "0",
  startsAt: "",
  endsAt: "",
  isActive: true,
};

const won = (value: number) => new Intl.NumberFormat("ko-KR").format(value) + "원";

function toLocalDateTimeInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatPeriod(startsAt: Date | string | null | undefined, endsAt: Date | string | null | undefined) {
  const start = formatDateTime(startsAt);
  const end = formatDateTime(endsAt);
  if (start && end) return `${start} ~ ${end}`;
  if (start) return `${start}부터`;
  if (end) return `${end}까지`;
  return "기간 제한 없음";
}

function toPayload(draft: Draft) {
  const salePrice = Number(draft.salePrice.replace(/[^0-9]/g, ""));
  const regularRaw = draft.regularPrice.replace(/[^0-9]/g, "");
  const regularPrice = regularRaw ? Number(regularRaw) : null;
  const startsAt = draft.startsAt ? new Date(draft.startsAt) : null;
  const endsAt = draft.endsAt ? new Date(draft.endsAt) : null;

  if (!Number.isSafeInteger(salePrice) || salePrice <= 0) throw new Error("특가를 원 단위 숫자로 입력해 주세요.");
  if (regularPrice !== null && (!Number.isSafeInteger(regularPrice) || regularPrice < salePrice)) throw new Error("정상가는 특가 이상이어야 합니다.");
  if (startsAt && Number.isNaN(startsAt.getTime())) throw new Error("시작 일시를 확인해 주세요.");
  if (endsAt && Number.isNaN(endsAt.getTime())) throw new Error("종료 일시를 확인해 주세요.");
  if (startsAt && endsAt && endsAt <= startsAt) throw new Error("종료 일시는 시작 일시보다 뒤여야 합니다.");

  return {
    title: draft.title.trim(),
    storeName: draft.storeName.trim() || "스마트스토어",
    description: draft.description.trim() || null,
    imageUrl: draft.imageUrl.trim() || null,
    purchaseUrl: draft.purchaseUrl.trim(),
    regularPrice,
    salePrice,
    sortOrder: Number(draft.sortOrder) || 0,
    isActive: draft.isActive,
    startsAt: startsAt?.toISOString() ?? null,
    endsAt: endsAt?.toISOString() ?? null,
  };
}

export default function AdminHotDeals() {
  const { user, loading } = useAuth();
  const isAdmin = isAdminUser(user);
  const utils = trpc.useUtils();
  const deals = trpc.hotDeals.adminList.useQuery(undefined, { enabled: isAdmin });
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const create = trpc.hotDeals.create.useMutation({ onError: error => toast.error(error.message) });
  const update = trpc.hotDeals.update.useMutation({ onError: error => toast.error(error.message) });
  const remove = trpc.hotDeals.remove.useMutation({ onError: error => toast.error(error.message) });
  const saving = create.isPending || update.isPending;
  const refresh = async () => Promise.all([utils.hotDeals.adminList.invalidate(), utils.hotDeals.list.invalidate()]);

  const submit = () => {
    let data: ReturnType<typeof toPayload>;
    try {
      data = toPayload(draft);
    } catch (error) {
      return toast.error(error instanceof Error ? error.message : "입력값을 확인해 주세요.");
    }
    const onSuccess = async () => {
      await refresh();
      setDraft(emptyDraft);
      setEditingId(null);
      toast.success(editingId ? "특가를 수정했습니다." : "특가를 등록했습니다.");
    };
    if (editingId) update.mutate({ hotDealId: editingId, data }, { onSuccess });
    else create.mutate(data, { onSuccess });
  };

  const beginEdit = (deal: NonNullable<typeof deals.data>[number]) => {
    setEditingId(deal.id);
    setDraft({
      title: deal.title,
      storeName: deal.storeName,
      description: deal.description ?? "",
      imageUrl: deal.imageUrl ?? "",
      purchaseUrl: deal.purchaseUrl,
      regularPrice: deal.regularPrice?.toString() ?? "",
      salePrice: deal.salePrice.toString(),
      sortOrder: deal.sortOrder.toString(),
      startsAt: toLocalDateTimeInput(deal.startsAt),
      endsAt: toLocalDateTimeInput(deal.endsAt),
      isActive: deal.isActive,
    });
  };

  const field = (label: string, key: DraftTextField, type = "text", placeholder = "") => (
    <label className="grid gap-1.5 text-xs font-bold text-[#3b5c43]">
      <span>{label}</span>
      <input
        type={type}
        value={draft[key]}
        placeholder={placeholder}
        onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))}
        className="h-11 rounded-xl border border-[#d6e5d7] bg-white px-3 text-sm text-[#1c3423] outline-none focus:border-[#249450] focus:ring-2 focus:ring-[#bce9c8] dark:bg-[#102216] dark:text-[#e6f5e8]"
      />
    </label>
  );

  if (loading) return <div className="py-16 text-center text-sm text-[#718074]">권한을 확인하는 중입니다.</div>;
  if (!isAdmin) return <div className="rounded-2xl border border-[#f1d0cf] bg-[#fff7f6] p-5 text-sm text-[#a33b37]">관리자만 특가를 관리할 수 있습니다.</div>;

  return (
    <section className="space-y-5 pb-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-extrabold tracking-wide text-[#2a8751]">SMARTSTORE SPECIALS</p>
          <h1 className="mt-1 text-2xl font-extrabold text-[#1b3a24] dark:text-[#e6f5e8]">특가 관리</h1>
        </div>
        <Link href="/hot-deals" className="rounded-full border border-[#c9e2cf] px-3 py-2 text-xs font-bold text-[#176b3a]">공개 화면</Link>
      </div>

      <div className="rounded-3xl border border-[#c9e2cf] bg-[#f4fbf5] p-4 shadow-sm dark:border-[#31513c] dark:bg-[#183024]">
        <div className="mb-4 flex items-center gap-2 text-sm font-extrabold text-[#176b3a] dark:text-[#a9e8bd]">
          <Flame className="size-4" />{editingId ? "특가 수정" : "스마트스토어 특가 등록"}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("상품명", "title", "text", "예: 주방용품 특가")}
          {field("스토어명", "storeName", "text", "스마트스토어")}
          {field("특가", "salePrice", "number", "예: 12900")}
          {field("정상가(선택)", "regularPrice", "number", "예: 19900")}
          {field("스마트스토어 구매 링크", "purchaseUrl", "url", "https://smartstore.naver.com/...")}
          {field("이미지 URL(선택)", "imageUrl", "url", "https://...")}
          {field("특가 시작 일시(선택)", "startsAt", "datetime-local")}
          {field("특가 종료 일시(선택)", "endsAt", "datetime-local")}
          {field("정렬 순서", "sortOrder", "number", "0")}
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-[#58705d] dark:text-[#a5c5ad]"><CalendarClock className="mt-0.5 size-3.5 shrink-0" />기간을 비워두면 항상 노출됩니다. 시작 전 또는 종료 후에는 공개 특가 목록에서 자동으로 숨겨집니다.</p>
        <label className="mt-3 grid gap-1.5 text-xs font-bold text-[#3b5c43]">
          <span>특가 설명(선택)</span>
          <textarea value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} rows={3} className="rounded-xl border border-[#d6e5d7] bg-white p-3 text-sm outline-none focus:border-[#249450] dark:bg-[#102216] dark:text-[#e6f5e8]" placeholder="특가 기간, 구성 등 필요한 정보만 입력하세요." />
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm font-bold text-[#31593b]">
          <input type="checkbox" checked={draft.isActive} onChange={event => setDraft(current => ({ ...current, isActive: event.target.checked }))} />공개 노출
        </label>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={submit} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#176b3a] px-4 text-sm font-extrabold text-white disabled:opacity-60"><Save className="size-4" />{saving ? "저장 중" : editingId ? "수정 저장" : "특가 등록"}</button>
          {editingId ? <button type="button" onClick={() => { setEditingId(null); setDraft(emptyDraft); }} className="h-11 rounded-xl border border-[#cbdacd] px-4 text-sm font-bold text-[#58705d]">취소</button> : null}
        </div>
      </div>

      <div className="space-y-3">
        {deals.isLoading ? <p className="py-6 text-center text-sm text-[#718074]">등록 상품을 불러오는 중입니다.</p> : null}
        {(deals.data ?? []).map(deal => (
          <article key={deal.id} className="flex gap-3 rounded-2xl border border-[#dbe8dc] bg-white p-3 shadow-sm dark:border-[#31513c] dark:bg-[#183024]">
            <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#edf5ee] text-[#5d8a66]">{deal.imageUrl ? <img src={deal.imageUrl} alt="" className="size-full object-cover" /> : <Flame className="size-5" />}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><h2 className="truncate text-sm font-extrabold text-[#213c27] dark:text-[#e6f5e8]">{deal.title}</h2><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${deal.isActive ? "bg-[#e4f5e7] text-[#207542]" : "bg-[#f2f2f2] text-[#7b7b7b]"}`}>{deal.isActive ? "공개" : "비공개"}</span></div>
              <p className="mt-1 text-xs font-bold text-[#176b3a]">{won(deal.salePrice)}</p>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-[#718074]"><CalendarClock className="size-3" />{formatPeriod(deal.startsAt, deal.endsAt)}</p>
              <a href={deal.purchaseUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#3e8960]"><ExternalLink className="size-3" />구매 링크 확인</a>
            </div>
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => beginEdit(deal)} className="grid size-9 place-items-center rounded-lg border border-[#cfe1d1] text-[#176b3a]" aria-label="특가 수정"><Pencil className="size-4" /></button>
              <button type="button" onClick={() => { if (window.confirm(`‘${deal.title}’ 특가를 삭제할까요?`)) remove.mutate({ hotDealId: deal.id }, { onSuccess: async () => { await refresh(); toast.success("특가를 삭제했습니다."); } }); }} className="grid size-9 place-items-center rounded-lg border border-[#f0d1ce] text-[#bc4b46]" aria-label="특가 삭제"><Trash2 className="size-4" /></button>
            </div>
          </article>
        ))}
        {!deals.isLoading && (deals.data?.length ?? 0) === 0 ? <p className="rounded-2xl border border-dashed border-[#cbdacd] p-6 text-center text-sm text-[#718074]">등록된 특가가 없습니다.</p> : null}
      </div>
    </section>
  );
}
