import { Flame, ExternalLink, Store, Tag } from "lucide-react";
import { trpc } from "@/lib/trpc";

const won = (value: number) => new Intl.NumberFormat("ko-KR").format(value) + "원";

const formatDateTime = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
};

const formatPeriod = (startsAt: Date | string | null | undefined, endsAt: Date | string | null | undefined) => {
  const start = formatDateTime(startsAt);
  const end = formatDateTime(endsAt);
  if (start && end) return `${start} ~ ${end}`;
  if (start) return `${start}부터`;
  if (end) return `${end}까지`;
  return null;
};

export default function HotDeals() {
  const deals = trpc.hotDeals.list.useQuery();
  if (deals.isLoading) return <div className="py-20 text-center text-sm text-[#748176]">특가를 불러오는 중입니다.</div>;
  return <section className="space-y-5 pb-4">
    <div className="rounded-3xl bg-gradient-to-br from-[#176b3a] via-[#238657] to-[#73c788] p-6 text-white shadow-[0_16px_40px_rgba(23,107,58,.18)]">
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/16 px-3 py-1 text-xs font-bold"><Flame className="size-3.5" /> SMARTSTORE SPECIAL</div>
      <h1 className="text-2xl font-extrabold tracking-tight">놓치기 아쉬운 오늘의 특가</h1>
      <p className="mt-2 text-sm leading-relaxed text-white/85">관리자가 직접 확인한 스마트스토어 특가를 모았습니다. 구매는 스마트스토어에서 진행됩니다.</p>
    </div>
    {deals.isError ? <div className="rounded-2xl border border-[#f1d0cf] bg-[#fff7f6] p-4 text-sm text-[#a33b37]">특가를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div> : null}
    {!deals.isError && (deals.data?.length ?? 0) === 0 ? <div className="rounded-3xl border border-dashed border-[#c7d8c8] bg-white p-10 text-center shadow-sm dark:bg-[#183024]"><Tag className="mx-auto size-7 text-[#75a47d]" /><p className="mt-3 font-bold text-[#294a32] dark:text-[#d8f2dd]">등록된 특가가 아직 없습니다.</p><p className="mt-1 text-sm text-[#718074]">관리자가 스마트스토어 특가를 등록하면 여기에 표시됩니다.</p></div> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      {(deals.data ?? []).map(deal => {
        const discount = deal.regularPrice && deal.regularPrice > deal.salePrice ? Math.round((1 - deal.salePrice / deal.regularPrice) * 100) : null;
        const period = formatPeriod(deal.startsAt, deal.endsAt);
        return <article key={deal.id} className="overflow-hidden rounded-3xl border border-[#d9e8da] bg-white shadow-[0_10px_28px_rgba(40,80,48,.08)] dark:border-[#31513c] dark:bg-[#183024]">
          <div className="relative aspect-[4/3] bg-[#edf5ee]">
            {deal.imageUrl ? <img src={deal.imageUrl} alt={deal.title} className="size-full object-cover" /> : <div className="flex size-full flex-col items-center justify-center text-[#5d8a66]"><Store className="size-9" /><span className="mt-2 text-xs font-bold">스마트스토어 특가</span></div>}
            {discount ? <span className="absolute left-3 top-3 rounded-full bg-[#e85d4f] px-2.5 py-1 text-xs font-extrabold text-white">{discount}% 특가</span> : null}
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#27854c]"><Store className="size-3.5" />{deal.storeName}</div>
            <h2 className="line-clamp-2 min-h-12 text-base font-extrabold leading-snug text-[#1c3423] dark:text-[#e6f5e8]">{deal.title}</h2>
            {deal.description ? <p className="line-clamp-2 text-xs leading-relaxed text-[#718074]">{deal.description}</p> : null}
            {period ? <p className="text-[11px] font-medium text-[#5f7f67]">특가 기간 · {period}</p> : null}
            <div className="flex items-end gap-2"><strong className="text-xl font-extrabold text-[#176b3a] dark:text-[#a9e8bd]">{won(deal.salePrice)}</strong>{deal.regularPrice ? <span className="pb-0.5 text-xs text-[#91a093] line-through">{won(deal.regularPrice)}</span> : null}</div>
            <a href={deal.purchaseUrl} target="_blank" rel="nofollow sponsored noopener noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#176b3a] px-4 text-sm font-extrabold text-white transition hover:bg-[#125a30] active:scale-[.98]">스마트스토어로 구매하기 <ExternalLink className="size-4" /></a>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
