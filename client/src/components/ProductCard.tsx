import { Heart, PackageOpen, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { getProductMetaTags } from "@/lib/productMeta";
import { getProductDisplayName, getProductOptionDisplayLabel } from "@/lib/productDisplayName";
import { getOptimizedProductImageUrl } from "@/lib/optimizedImage";

export type ProductCardItem = {
  id: number | null;
  externalProductId?: string;
  name: string;
  imageUrl: string;
  currentPrice: number;
  lowestPrice: number;
  variantLabel: string | null;
  unitPrice: number | null;
  unitLabel: string | null;
  quantity?: number | null;
  packSize?: string | null;
  familyKey?: string | null;
  source: "goldbox" | "search" | "bestcategory" | "collection";
  isRocket: boolean;
  isFreeShipping: boolean;
  inStock?: boolean;
  /**
   * 이 상품이 마지막으로 관측(수집기·공식 API 등 무엇이든)된 시각. 있으면 오래된
   * 관측값에 "최저가" 배지를 붙이지 않는 데 쓴다. 전체 상품 행을 그대로 내려주는
   * 목록(홈·골드박스·찜한상품)에는 이미 포함돼 있고, 검색 결과처럼 실시간으로 다시
   * 조회한 값에는 없을 수 있다(그 경우 신선도 판단 없이 기존처럼 동작).
   */
  lastSeenAt?: Date | string | null;
  /**
   * 검색 결과 카드는 클릭 전까지 실제로 저장되지 않아 id가 없다(id: null). 이 경우
   * 상세 페이지를 열려면 먼저 실제 저장(가격 추적 시작)이 필요하다는 뜻이며, 그
   * 저장에 필요한 최소 식별 정보를 담는다.
   */
  pendingMaterialize?: { keyword: string; productId: number; productUrl: string } | null;
};

export type UserConfirmedPriceBadge = { price: number; checkedAt: Date | string };

function won(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

export default function ProductCard({
  product,
  isFavorite = false,
  onFavorite,
  onOpen,
  userConfirmedPrice,
  priority = false,
}: {
  product: ProductCardItem;
  isFavorite?: boolean;
  onFavorite?: (product: ProductCardItem) => void;
  /**
   * 지정하면 카드를 눌렀을 때 실제 라우팅 대신 이 콜백만 호출한다. 아직 저장되지
   * 않은(id: null) 검색 결과 카드를 다루는 화면(검색 결과 목록)에서 사용한다.
   * 지정하지 않으면 기존처럼 product.id로 바로 상세 페이지 링크를 사용한다.
   */
  onOpen?: (product: ProductCardItem) => void;
  userConfirmedPrice?: UserConfirmedPriceBadge;
  priority?: boolean;
}) {
  const hasRecordedPrice = product.currentPrice > 0;
  // 2026-09-17: "최저가" 배지가 마지막 확인 시각과 무관하게 currentPrice===lowestPrice
  // 조건만으로 붙어서, 수집이 며칠째 멈춘 상품도 계속 "최저가"로 보이는 문제가 있었다.
  // 찜한상품 알림에서 이미 쓰고 있는 "7일 지나면 신선하지 않음" 기준을 그대로 재사용해,
  // 7일 넘게 확인이 안 된 상품은 "최저가" 대신 "마지막 확인 {날짜}"를 보여준다.
  const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
  const lastSeenAt = product.lastSeenAt ? new Date(product.lastSeenAt) : null;
  const isStale = Boolean(lastSeenAt && !Number.isNaN(lastSeenAt.getTime()) && Date.now() - lastSeenAt.getTime() > STALE_THRESHOLD_MS);
  const isLowest = hasRecordedPrice && product.currentPrice === product.lowestPrice && !isStale;
  const displayVariantLabel = product.variantLabel?.trim() === "가신 수집기 상품" ? null : product.variantLabel;
  const metaTags = getProductMetaTags(displayVariantLabel, product.unitLabel, product.name, product.quantity, product.packSize);
  const quantityLabel = product.quantity && product.quantity > 0 ? `${product.quantity}개` : metaTags.quantity;
  const compositionLabel = [metaTags.capacity ? `용량 ${metaTags.capacity}` : null, quantityLabel ? `수량 ${quantityLabel}` : null].filter(Boolean).join(" · ");
  const displayName = getProductDisplayName(product.name, displayVariantLabel, product.unitLabel);
  const optionDisplayLabel = getProductOptionDisplayLabel(displayVariantLabel, product.unitLabel);
  const hasOptionMetadata = Boolean(optionDisplayLabel || metaTags.capacity || metaTags.quantity || metaTags.packSize);
  // 용량은 같고 수량(묶음 개수)만 다른 옵션끼리도 공정하게 비교할 수 있도록,
  // 수량이 2개 이상 확인된 상품에는 "수량 1개당 가격"을 함께 보여준다.
  const perItemPrice = hasRecordedPrice && product.quantity && product.quantity > 1 ? Math.round(product.currentPrice / product.quantity) : null;

  const cardBody = (
    <>
      <div className="relative mb-3 aspect-square overflow-hidden rounded-xl bg-[#f4f7f3]">
        {product.imageUrl ? (
          <img src={getOptimizedProductImageUrl(product.imageUrl, priority ? 312 : 156)} alt="" width={156} height={156} className="size-full object-contain p-2 transition duration-300 group-hover:scale-105" loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" />
        ) : (
          <PackageOpen className="absolute inset-0 m-auto size-7 text-[#b8c6ba]" />
        )}
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
          {product.source === "goldbox" && <span className="rounded-md bg-[#176b3a] px-1.5 py-0.5 text-[9px] font-bold text-white">골드박스</span>}
          {product.source === "bestcategory" && <span className="rounded-md bg-[#318d65] px-1.5 py-0.5 text-[9px] font-bold text-white">카테고리 베스트</span>}
          {product.isRocket && <span className="rounded-md bg-[#edf5ff] px-1.5 py-0.5 text-[9px] font-bold text-[#3576ba]">로켓</span>}
          {product.inStock === false && <span className="rounded-md bg-[#f0f2f0] px-1.5 py-0.5 text-[9px] font-bold text-[#646b66]">품절</span>}
        </div>
      </div>
      <h3 className="line-clamp-2 min-h-10 text-[13px] font-semibold leading-5 tracking-[-0.035em] text-[#25362a]">{displayName}</h3>
      {optionDisplayLabel ? <p className="mt-1 truncate text-[10px] font-semibold text-[#5d7462]">{optionDisplayLabel}</p> : <p className="mt-1 h-3.5" />}
      {!hasOptionMetadata ? <span className="mt-2 inline-flex rounded-full border border-[#ecd09f] bg-[#fffaf0] px-2 py-1 text-[10px] font-bold text-[#94601a]">옵션 미확인</span> : null}
      {compositionLabel || metaTags.packSize ? <div className="mt-2 flex flex-wrap gap-1.5">{compositionLabel ? <span className="rounded-full bg-[#e7f3e9] px-2 py-1 text-[10px] font-bold text-[#176b3a]">{compositionLabel}</span> : null}{metaTags.packSize ? <span className="rounded-full bg-[#fff3df] px-2 py-1 text-[10px] font-bold text-[#9a6415]">포장 {metaTags.packSize}</span> : null}</div> : null}
      <div className="mt-2 flex items-end justify-between gap-1">
        <strong className="text-[16px] tracking-[-0.045em] text-[#132018]">{!hasRecordedPrice ? "가격 정보 없음" : product.inStock === false ? `마지막 ${won(product.currentPrice)}` : won(product.currentPrice)}</strong>
        {product.inStock === false ? <span className="mb-0.5 text-[10px] font-bold text-[#646b66]">품절</span> : isStale && lastSeenAt ? (
          <span className="mb-0.5 text-[10px] font-medium text-[#a15e42]">마지막 확인 {lastSeenAt.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}</span>
        ) : isLowest ? (
          <span className="mb-0.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-[#118245]"><Sparkles className="size-3" />최저가</span>
        ) : hasRecordedPrice ? (
          <span className="mb-0.5 text-[10px] font-medium text-[#8b978d]">최저 {won(product.lowestPrice)}</span>
        ) : null}
      </div>
      {userConfirmedPrice ? <p className="mt-1 rounded-md bg-[#fff5d9] px-1.5 py-1 text-[9px] font-bold text-[#8a600e]">직접 확인 {won(userConfirmedPrice.price)} · {new Date(userConfirmedPrice.checkedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}</p> : null}
      {product.unitPrice && product.unitLabel ? <p className="mt-1 text-[10px] font-medium text-[#6e806f]">{product.unitLabel}당 {won(product.unitPrice)}</p> : null}
      {perItemPrice !== null ? <p className="mt-1 text-[10px] font-medium text-[#6e806f]">1개당 {won(perItemPrice)}</p> : null}
    </>
  );

  return (
    <article className="group relative overflow-hidden rounded-2xl bg-white p-3 shadow-[0_6px_24px_rgba(35,71,43,.06)] ring-1 ring-[#e9efea] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(35,71,43,.11)]">
      <button
        type="button"
        aria-label={isFavorite ? "찜한상품에서 제거" : "찜한상품에 추가"}
        onClick={() => onFavorite?.(product)}
        className={`absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full border transition active:scale-95 ${
          isFavorite ? "border-[#176b3a] bg-[#176b3a] text-white" : "border-[#e4ece5] bg-white/95 text-[#7f8f82]"
        }`}
      >
        <Heart className={`size-4 ${isFavorite ? "fill-current" : ""}`} />
      </button>

      {onOpen ? (
        <div
          role="link"
          tabIndex={0}
          onClick={() => onOpen(product)}
          onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen(product);
            }
          }}
          className="block cursor-pointer"
        >
          {cardBody}
        </div>
      ) : (
        <Link href={`/product/${product.id}`} className="block">
          {cardBody}
        </Link>
      )}
    </article>
  );
}
