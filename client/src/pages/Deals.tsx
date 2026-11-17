import { ArrowDownToLine, TrendingDown } from "lucide-react";
import { Link, useParams } from "wouter";
import ProductCard from "@/components/ProductCard";
import { useFavorites } from "@/hooks/useFavorites";
import { trpc } from "@/lib/trpc";
import NotFound from "@/pages/NotFound";

type DealKind = "drops" | "low";

const COPY: Record<DealKind, { title: string; lead: string; label: string; Icon: typeof TrendingDown }> = {
  drops: {
    title: "최근 7일 가격이 내린 상품",
    lead: "가신이 수집한 가격 이력에서 최근 7일 안에 가격이 내려간 쿠팡 상품입니다.",
    label: "가격 내린 상품",
    Icon: TrendingDown,
  },
  low: {
    title: "90일 가격 저점에 가까운 상품",
    lead: "현재가가 90일 관측 가격 이력의 가장 낮은 가격 근처인 쿠팡 상품입니다.",
    label: "가격 저점 근접",
    Icon: ArrowDownToLine,
  },
};

const won = (value: number) => `${new Intl.NumberFormat("ko-KR").format(value)}원`;

// 서버(UTC)와 브라우저(KST)의 표시가 달라 hydration 경고가 나지 않도록 시간대를 고정한다.
const observedFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
function formatObserved(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : observedFormatter.format(date);
}

function isDealKind(value: string | undefined): value is DealKind {
  return value === "drops" || value === "low";
}

export default function Deals() {
  const params = useParams<{ kind: string }>();
  const valid = isDealKind(params.kind);
  const kind: DealKind = valid ? (params.kind as DealKind) : "drops";
  const deals = trpc.catalog.deals.useQuery({ kind }, { enabled: valid });
  const { favoriteIds, toggleProduct } = useFavorites();

  if (!valid) return <NotFound />;

  const copy = COPY[kind];
  const items = deals.data?.items ?? [];

  return (
    <section>
      <div className="mb-4 rounded-3xl bg-[#176b3a] p-6 text-white shadow-[0_18px_40px_rgba(23,107,58,.20)]">
        <span className="mb-3 inline-flex size-9 items-center justify-center rounded-xl bg-white/15"><copy.Icon className="size-5" /></span>
        <h1 className="text-2xl font-extrabold tracking-[-0.065em]">{copy.title}</h1>
        <p className="mt-2 text-sm leading-6 text-[#d8f0dc]">{copy.lead}</p>
      </div>

      <nav aria-label="가격 목록 종류" className="mb-4 flex gap-2">
        {(Object.keys(COPY) as DealKind[]).map(item => (
          <Link
            key={item}
            href={`/deals/${item}`}
            aria-current={item === kind ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-bold ${item === kind ? "bg-[#176b3a] text-white" : "bg-white text-[#176b3a] ring-1 ring-[#d8e6da]"}`}
          >
            {COPY[item].label}
          </Link>
        ))}
      </nav>

      <p className="mb-4 text-xs leading-5 text-[#829184]">
        가신이 수집한 가격 이력 기준입니다. 표시된 관측 시각 이후 가격이 달라졌을 수 있으니 결제 전 쿠팡에서 최종 가격을 확인하세요.{" "}
        <Link href="/methodology" className="underline">가격 검증 방법</Link>
      </p>

      {deals.isLoading ? <p className="py-16 text-center text-sm text-[#829184]">상품을 불러오는 중입니다.</p> : null}
      {deals.isError ? <p className="rounded-2xl bg-white py-16 text-center text-sm text-[#829184]">목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : null}
      {!deals.isLoading && !deals.isError && items.length === 0 ? (
        <p className="rounded-2xl bg-white py-16 text-center text-sm text-[#829184]">조건에 맞는 상품이 아직 없습니다. 가격 이력이 쌓이면 표시됩니다.</p>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map(item => {
          const observed = formatObserved(item.product.lastSeenAt);
          return (
            <li key={item.product.id} className="flex flex-col gap-1.5">
              <ProductCard product={item.product} isFavorite={favoriteIds.has(item.product.id)} onFavorite={entry => { if (entry.id != null) toggleProduct(entry.id); }} />
              <p className="px-1 text-xs leading-5 text-[#4f6354]">
                {kind === "drops" ? (
                  <>
                    <span className="font-bold text-[#176b3a]">-{item.changePct}%</span> · 7일 내 {won(item.referencePrice)} → {won(item.product.currentPrice)}
                  </>
                ) : (
                  <>
                    90일 관측 {won(item.low90)} ~ {won(item.high90)} · 고점 대비 <span className="font-bold text-[#176b3a]">-{item.changePct}%</span>
                  </>
                )}
                {observed ? <span className="block text-[#829184]">마지막 관측 {observed}</span> : null}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
