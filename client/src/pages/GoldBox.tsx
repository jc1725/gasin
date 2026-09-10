import { Gem } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import { useFavorites } from "@/hooks/useFavorites";
import { trpc } from "@/lib/trpc";

export default function GoldBox() {
  const products = trpc.catalog.list.useQuery({ source: "goldbox", limit: 100 });
  const { favoriteIds, toggleProduct } = useFavorites();

  return (
    <section>
      <div className="mb-6 rounded-3xl bg-[#176b3a] p-6 text-white shadow-[0_18px_40px_rgba(23,107,58,.20)]">
        <span className="mb-3 inline-flex size-9 items-center justify-center rounded-xl bg-white/15"><Gem className="size-5" /></span>
        <h1 className="text-2xl font-extrabold tracking-[-0.065em]">오늘의 골드박스</h1>
        <p className="mt-2 text-sm leading-6 text-[#d8f0dc]">12시간마다 수집한 쿠팡 특가 상품을 한곳에서 확인하세요.</p>
      </div>
      {products.isLoading ? <p className="py-16 text-center text-sm text-[#829184]">골드박스 상품을 불러오는 중입니다.</p> : null}
      {!products.isLoading && products.data?.length === 0 ? <p className="rounded-2xl bg-white py-16 text-center text-sm text-[#829184]">첫 골드박스 수집을 기다리고 있습니다.</p> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {products.data?.map(product => <ProductCard key={product.id} product={product} isFavorite={favoriteIds.has(product.id)} onFavorite={item => { if (item.id != null) toggleProduct(item.id); }} />)}
      </div>
    </section>
  );
}
