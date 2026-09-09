import { buildGuideFaqSchema, siteOrganizationSchema, siteWebApplicationSchema } from "@/lib/guideContent";
import { buildMethodologyFaqSchema, methodologyWebPageSchema } from "./methodologyContent";

export const SITE_URL = "https://gasin.shop";
export const SITE_OG_IMAGE = "/manus-storage/gasyn-text-shortcut-icon-preview_1bf92205.png";

export type PageMeta = {
  title: string;
  description: string;
  socialTitle: string;
  socialDescription: string;
  canonicalPath?: string;
  structuredData?: object[];
};

function formatWon(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function cleanProductName(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return Array.from(normalized).length > 42 ? `${Array.from(normalized).slice(0, 42).join("")}…` : normalized;
}

export function getProductPageMeta(product: { id: number; name: string; currentPrice: number; lowestPrice: number; inStock: boolean; imageUrl?: string | null }, history: Array<{ price: number; recordedAt: Date | string }>): PageMeta {
  const name = cleanProductName(product.name);
  const prices = history.map(point => point.price).filter(price => Number.isFinite(price) && price > 0);
  const low = prices.length ? Math.min(...prices) : product.lowestPrice;
  const current = product.currentPrice;
  const path = `/product/${product.id}`;
  const availability = product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
  const productSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    url: `${SITE_URL}${path}`,
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}${path}`,
      price: String(current),
      priceCurrency: "KRW",
      availability,
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "쿠팡" },
      priceValidUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    },
  };
  if (product.imageUrl) productSchema.image = [product.imageUrl];
  return {
    title: `${name} 가격 추이 | 최저 ${formatWon(low)}원 | 가신`,
    description: `${name}의 현재 가격은 ${formatWon(current)}원, 최근 90일 최저가는 ${formatWon(low)}원입니다. 가격 이력과 옵션별 변동을 가신에서 확인하세요.`,
    socialTitle: `${name} | 지금 ${formatWon(current)}원, 최근 최저가 대비 확인 | 가신`,
    socialDescription: `${name}의 현재가 ${formatWon(current)}원과 90일 최저가 ${formatWon(low)}원을 가격 이력으로 비교하세요.`,
    canonicalPath: path,
    structuredData: [productSchema, { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "가신", item: `${SITE_URL}/` }, { "@type": "ListItem", position: 2, name: product.name, item: `${SITE_URL}${path}` }] }],
  };
}

export function getPageMeta(path: string): PageMeta {
  if (path.startsWith("/methodology")) return { title: "가격 검증 방법·와우회원가 기준 | 가신", description: "가신이 정확 옵션 SKU, 최근 와우회원가 관측, 90일 가격 이력으로 가격을 검증하는 방법을 확인하세요.", socialTitle: "가신은 가격을 이렇게 검증합니다", socialDescription: "와우회원가 관측 시각, 옵션 SKU, 90일 가격 이력을 함께 확인하세요." };
  if (path.startsWith("/guide")) return { title: "쿠팡 와우회원가·가격 알림 가이드 | 가신", description: "쿠팡 와우회원가 확인, 같은 상품 옵션 비교, 가격 변동 알림 방법을 가신 가이드에서 확인하세요.", socialTitle: "가격을 있는 그대로 믿지 마세요 | 가신 가이드", socialDescription: "와우회원가, 할인율, 옵션별 가격 이력까지 비교해 진짜 가격 흐름을 확인하세요." };
  if (path.startsWith("/goldbox")) return { title: "쿠팡 골드박스 가격 추적 | 가신", description: "가신에서 쿠팡 골드박스 상품과 가격 흐름을 확인하세요.", socialTitle: "골드박스 가격도 이력으로 비교하세요 | 가신", socialDescription: "쿠팡 골드박스 상품의 가격 흐름을 가신에서 확인하세요." };
  if (path.startsWith("/hot-deals")) return { title: "특가 상품 | 가신", description: "가신이 소개하는 기간 한정 특가 상품을 확인하세요.", socialTitle: "기간 한정 특가를 확인하세요 | 가신", socialDescription: "가신이 소개하는 특가 상품과 판매 조건을 확인하세요." };
  if (path.startsWith("/favorites")) return { title: "찜한 상품 가격 알림 | 가신", description: "찜한 상품의 목표가와 최근 가격 관측을 관리하세요.", socialTitle: "원하는 가격에 알려주는 가신", socialDescription: "찜한 상품의 목표가와 최근 가격 흐름을 관리하세요." };
  if (path.startsWith("/search")) return { title: "쿠팡 상품 가격 검색 | 가신", description: "상품명과 옵션·용량·수량으로 쿠팡 상품 가격 흐름을 검색하세요.", socialTitle: "같은 옵션인지 먼저 확인하세요 | 가신", socialDescription: "상품명과 옵션·용량·수량을 기준으로 가격 흐름을 검색하세요." };
  if (path.startsWith("/product")) return { title: "상품 가격 흐름 | 가신", description: "옵션별 최근 가격과 가격 이력을 가신에서 확인하세요.", socialTitle: "지금 이 가격, 진짜 최저가일까요? | 가신", socialDescription: "옵션별 최근 가격과 가격 이력을 비교해 보세요." };
  return { title: "가신 | 쿠팡 가격 추적", description: "쿠팡 상품의 옵션별 가격 흐름과 최근 수집 관측가를 기록하는 가신 가격 추적 서비스입니다.", socialTitle: "쿠팡 가격, 있는 그대로 믿지 마세요 | 가신", socialDescription: "와우회원가와 옵션별 가격 이력을 비교해 진짜 가격 흐름을 확인하세요." };
}

export function getStructuredDataForPath(path: string, pageData?: object[]): object[] {
  const baseSchemas = [siteOrganizationSchema, siteWebApplicationSchema];
  const labels: Record<string, string> = { "/guide": "가격 가이드", "/methodology": "가격 검증 방법", "/goldbox": "골드박스" };
  const matchedPath = Object.keys(labels).find(candidate => path === candidate || path.startsWith(`${candidate}/`));
  const breadcrumb = matchedPath ? { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "가신", item: `${SITE_URL}/` }, { "@type": "ListItem", position: 2, name: labels[matchedPath], item: `${SITE_URL}${matchedPath}` }] } : null;
  if (path.startsWith("/methodology")) return [...baseSchemas, methodologyWebPageSchema, buildMethodologyFaqSchema(), ...(breadcrumb ? [breadcrumb] : [])];
  if (path.startsWith("/guide")) return [...baseSchemas, buildGuideFaqSchema(), ...(breadcrumb ? [breadcrumb] : [])];
  if (path.startsWith("/goldbox")) return [...baseSchemas, ...(breadcrumb ? [breadcrumb] : []), ...(pageData ?? [])];
  return pageData?.length ? [...baseSchemas, ...pageData] : baseSchemas;
}
