import { Scale } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

const won = (value: number) => `${new Intl.NumberFormat("ko-KR").format(value)}원`;

// 서버(UTC)와 브라우저(KST)의 표시가 달라 hydration 경고가 나지 않도록 시간대를 고정한다.
const observedFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
function formatObserved(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : observedFormatter.format(date);
}

function describeOption(option: { variantLabel: string | null; quantity: number | null }) {
  const label = option.variantLabel?.trim() || "구성 정보 없음";
  return option.quantity && option.quantity > 1 && !label.includes(`${option.quantity}`) ? `${label} × ${option.quantity}` : label;
}

export default function UnitPrice() {
  const result = trpc.catalog.unitPrice.useQuery();
  const groups = result.data?.groups ?? [];

  return (
    <section>
      <div className="mb-4 rounded-3xl bg-[#176b3a] p-6 text-white shadow-[0_18px_40px_rgba(23,107,58,.20)]">
        <span className="mb-3 inline-flex size-9 items-center justify-center rounded-xl bg-white/15"><Scale className="size-5" /></span>
        <h1 className="text-2xl font-extrabold tracking-[-0.065em]">용량별 단가 비교</h1>
        <p className="mt-2 text-sm leading-6 text-[#d8f0dc]">같은 상품의 용량·수량별 구성을 같은 기준 단가로 나란히 놓았습니다. 큰 포장이 항상 단가가 낮은 것은 아닙니다.</p>
      </div>

      <p className="mb-4 text-xs leading-5 text-[#829184]">
        가신이 수집한 가격 기준이며, 단가는 현재가를 용량·수량으로 나눠 계산했습니다. 같은 상품·같은 단가 기준끼리만 비교하고, 표시된 관측 시각 이후 가격이 달라졌을 수 있으니 결제 전 쿠팡에서 최종 가격을 확인하세요.{" "}
        <Link href="/methodology" className="underline">가격 검증 방법</Link>
      </p>

      {result.isLoading ? <p className="py-16 text-center text-sm text-[#829184]">비교 목록을 불러오는 중입니다.</p> : null}
      {result.isError ? <p className="rounded-2xl bg-white py-16 text-center text-sm text-[#829184]">목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : null}
      {!result.isLoading && !result.isError && groups.length === 0 ? (
        <p className="rounded-2xl bg-white py-16 text-center text-sm text-[#829184]">비교할 수 있는 상품이 아직 없습니다. 용량별 가격이 쌓이면 표시됩니다.</p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {groups.map(group => (
          <li key={`${group.familyKey}|${group.unitLabel}`} className="rounded-2xl bg-white p-4 ring-1 ring-[#d8e6da]">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-extrabold leading-5 tracking-[-0.04em] text-[#1f3a28]">{group.familyKey}</h2>
              <span className="shrink-0 rounded-full bg-[#e8f4ea] px-2.5 py-1 text-[11px] font-bold text-[#176b3a]">{group.unitLabel}당 · 최대 {group.savingPct}% 차이</span>
            </div>
            <table className="mt-3 w-full text-left text-xs">
              <caption className="sr-only">{group.familyKey} 용량·수량별 {group.unitLabel}당 단가 비교</caption>
              <thead className="text-[#829184]">
                <tr>
                  <th scope="col" className="pb-1.5 font-medium">구성</th>
                  <th scope="col" className="pb-1.5 text-right font-medium">현재가</th>
                  <th scope="col" className="pb-1.5 text-right font-medium">{group.unitLabel}당</th>
                </tr>
              </thead>
              <tbody>
                {group.options.map((option, index) => {
                  const observed = formatObserved(option.lastSeenAt);
                  return (
                    <tr key={option.productId} className="border-t border-[#eef3ef] align-top">
                      <td className="py-2 pr-2">
                        <Link href={`/product/${option.productId}`} className="font-bold text-[#1f3a28] underline-offset-2 hover:underline">{describeOption(option)}</Link>
                        {observed ? <span className="block text-[11px] text-[#829184]">관측 {observed}</span> : null}
                      </td>
                      <td className="py-2 text-right text-[#4f6354]">{won(option.currentPrice)}</td>
                      <td className={`py-2 text-right font-bold ${index === 0 ? "text-[#176b3a]" : "text-[#4f6354]"}`}>
                        {won(option.unitPrice)}
                        {index === 0 ? <span className="block text-[11px] font-medium">단가 가장 낮음</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </li>
        ))}
      </ul>
    </section>
  );
}
