import crypto from "node:crypto";
import { CoupangRateLimitError, getCoupangRateLimitRetryAt, type CoupangApiCallType } from "./coupangRateLimit";

const COUPANG_API_ORIGIN = "https://api-gateway.coupang.com";
const GOLD_BOX_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/goldbox";
const BEST_CATEGORY_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/bestcategories";
const SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
const DEEP_LINK_PATH = "/v2/providers/affiliate_open_api/apis/openapi/deeplink";
export const COUPANG_REQUEST_TIMEOUT_MS = 15_000;
export const COUPANG_TRANSIENT_RETRY_DELAY_MS = 1_000;

/** 쿠팡 파트너스 공식 문서에 명시된 최상위 카테고리 코드입니다. */
export const COUPANG_BEST_CATEGORY_IDS = [1001, 1002, 1010, 1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1024, 1025, 1026, 1029, 1030] as const;

export type CoupangProduct = {
  productId: number;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  categoryName?: string;
  isRocket?: boolean;
  isFreeShipping?: boolean;
};

export function normalizeCoupangProduct(value: unknown): CoupangProduct | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const productId = Number(raw.productId);
  const productPrice = Number(raw.productPrice);
  const productName = typeof raw.productName === "string" ? raw.productName.trim() : "";
  const productImage = typeof raw.productImage === "string" ? raw.productImage.trim() : "";
  const productUrl = typeof raw.productUrl === "string" ? raw.productUrl.trim() : "";
  if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(productPrice) || productPrice < 0 || !productName || !productImage || !productUrl) return null;
  return {
    productId,
    productName,
    productPrice,
    productImage,
    productUrl,
    categoryName: typeof raw.categoryName === "string" ? raw.categoryName : undefined,
    isRocket: Boolean(raw.isRocket),
    isFreeShipping: Boolean(raw.isFreeShipping),
  };
}

export function getCoupangVariantKey(product: Pick<CoupangProduct, "productId" | "productUrl">) {
  try {
    const url = new URL(product.productUrl);
    const itemId = url.searchParams.get("itemId");
    const vendorItemId = url.searchParams.get("vendorItemId");
    if (itemId && vendorItemId) return `${product.productId}:${itemId}:${vendorItemId}`;
  } catch {
    // A partner URL may be malformed; retain the API product ID as a stable fallback.
  }
  const urlFingerprint = crypto.createHash("sha256").update(product.productUrl).digest("hex").slice(0, 16);
  return `${product.productId}:url-${urlFingerprint}`;
}

type CoupangResponse<T> = {
  rCode: string;
  rMessage: string;
  data?: T;
};

export type CoupangDeepLink = {
  originUrl?: string;
  shortenUrl?: string;
  landingUrl?: string;
};

export class CoupangApiTimeoutError extends Error {
  constructor(operation: string) {
    super(`Coupang API ${operation} timed out after ${COUPANG_REQUEST_TIMEOUT_MS / 1_000} seconds`);
    this.name = "CoupangApiTimeoutError";
  }
}

export function withCoupangRequestTimeout<T>(request: Promise<T>, operation: string, timeoutMs = COUPANG_REQUEST_TIMEOUT_MS) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new CoupangApiTimeoutError(operation)), timeoutMs);
    request.then(value => {
      clearTimeout(timer);
      resolve(value);
    }, error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export function isTransientCoupangGatewayStatus(status: number) {
  return status === 502 || status === 503 || status === 504;
}

export async function retryTransientCoupangRequest<T extends { status: number }>(
  request: () => Promise<T>,
  delayMs = COUPANG_TRANSIENT_RETRY_DELAY_MS,
) {
  const first = await request();
  if (!isTransientCoupangGatewayStatus(first.status)) return first;
  if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
  return request();
}

function requiredEnv(name: "COUPANG_PARTNERS_ACCESS_KEY" | "COUPANG_PARTNERS_SECRET_KEY") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function signedDate(now = new Date()) {
  const yy = String(now.getUTCFullYear()).slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hour = String(now.getUTCHours()).padStart(2, "0");
  const minute = String(now.getUTCMinutes()).padStart(2, "0");
  const second = String(now.getUTCSeconds()).padStart(2, "0");
  return `${yy}${month}${day}T${hour}${minute}${second}Z`;
}

export function createCoupangAuthorization(method: string, pathWithQuery: string, now = new Date()) {
  const accessKey = requiredEnv("COUPANG_PARTNERS_ACCESS_KEY");
  const secretKey = requiredEnv("COUPANG_PARTNERS_SECRET_KEY");
  const [path, query = ""] = pathWithQuery.split("?");
  const timestamp = signedDate(now);
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(`${timestamp}${method.toUpperCase()}${path}${query}`)
    .digest("hex");

  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${timestamp}, signature=${signature}`;
}

async function get<T>(path: string, callType: CoupangApiCallType = "price-tracking"): Promise<CoupangResponse<T>> {
  const response = await retryTransientCoupangRequest(async () => {
    await guardCoupangApiRequest(callType);
    return withCoupangRequestTimeout(fetch(`${COUPANG_API_ORIGIN}${path}`, {
      headers: { Authorization: createCoupangAuthorization("GET", path) },
      signal: AbortSignal.timeout(COUPANG_REQUEST_TIMEOUT_MS),
    }), "request");
  });

  const payload = (await withCoupangRequestTimeout(response.json().catch(() => null), "response body")) as CoupangResponse<T> | null;
  if (!response.ok || !payload) {
    await throwIfCoupangRateLimit(response.status, payload?.rMessage ?? "");
    throw new Error(`Coupang API request failed with HTTP ${response.status}`);
  }
  if (payload.rCode !== "0") {
    await throwIfCoupangRateLimit(response.status, payload.rMessage);
    throw new Error(`Coupang API error ${payload.rCode}: ${payload.rMessage}`);
  }
  return payload;
}

async function post<T>(path: string, body: unknown, callType: CoupangApiCallType = "price-tracking"): Promise<CoupangResponse<T>> {
  await guardCoupangApiRequest(callType);
  const response = await withCoupangRequestTimeout(fetch(`${COUPANG_API_ORIGIN}${path}`, {
    method: "POST",
    headers: { Authorization: createCoupangAuthorization("POST", path), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(COUPANG_REQUEST_TIMEOUT_MS),
  }), "request");
  const payload = (await withCoupangRequestTimeout(response.json().catch(() => null), "response body")) as CoupangResponse<T> | null;
  if (!response.ok || !payload) {
    await throwIfCoupangRateLimit(response.status, payload?.rMessage ?? "");
    throw new Error(`Coupang API request failed with HTTP ${response.status}`);
  }
  if (payload.rCode !== "0") {
    await throwIfCoupangRateLimit(response.status, payload.rMessage);
    throw new Error(`Coupang API error ${payload.rCode}: ${payload.rMessage}`);
  }
  return payload;
}

async function guardCoupangApiRequest(callType: CoupangApiCallType) {
  const { reserveCoupangApiCall } = await import("./db");
  const decision = await reserveCoupangApiCall(callType);
  if (!decision.allowed) {
    throw new CoupangRateLimitError(decision.retryAt ?? new Date(Date.now() + 60_000), decision.reason ?? "minute-limit");
  }
}

async function throwIfCoupangRateLimit(status: number, message: string) {
  if (status !== 403 && !/분당\s*50|요청이\s*분당|minute.*50/i.test(message)) return;
  const retryAt = getCoupangRateLimitRetryAt(message);
  const detail = `쿠팡 분당 호출 제한 응답: ${message || `HTTP ${status}`}`;
  const { blockCoupangApiUntil } = await import("./db");
  await blockCoupangApiUntil(retryAt, detail);
  throw new CoupangRateLimitError(retryAt, detail);
}

export async function getGoldBoxProducts() {
  const result = await get<CoupangProduct[]>(`${GOLD_BOX_PATH}?imageSize=230x230`);
  return (result.data ?? []).flatMap(item => {
    const product = normalizeCoupangProduct(item);
    return product ? [product] : [];
  });
}

export function buildBestCategoryPath(categoryId: number, limit = 4) {
  if (!COUPANG_BEST_CATEGORY_IDS.includes(categoryId as (typeof COUPANG_BEST_CATEGORY_IDS)[number])) {
    throw new Error("지원하지 않는 쿠팡 카테고리 코드입니다.");
  }
  const query = new URLSearchParams({ limit: String(Math.max(1, Math.min(limit, 10))), imageSize: "230x230" });
  return `${BEST_CATEGORY_PATH}/${categoryId}?${query.toString()}`;
}

export async function getBestCategoryProducts(categoryId: number, limit = 4) {
  const result = await get<CoupangProduct[]>(buildBestCategoryPath(categoryId, limit));
  return (result.data ?? []).flatMap(item => {
    const product = normalizeCoupangProduct(item);
    return product ? [product] : [];
  });
}

export const MAX_COUPANG_SEARCH_KEYWORD_LENGTH = 50;

export function buildCoupangSearchPath(keyword: string, limit = 10) {
  // 쿠팡 Search API의 keyword 상한을 호출 계층에서도 보장한다.
  // 검색어 조합 규칙이 바뀌어도 예약 작업 전체가 400/500으로 중단되지 않는다.
  const normalizedKeyword = keyword.trim().slice(0, MAX_COUPANG_SEARCH_KEYWORD_LENGTH);
  if (!normalizedKeyword) throw new Error("검색어를 입력해 주세요.");

  const query = new URLSearchParams({
    keyword: normalizedKeyword,
    limit: String(Math.max(1, Math.min(limit, 10))),
    imageSize: "230x230",
    srpLinkOnly: "false",
  });
  return `${SEARCH_PATH}?${query.toString()}`;
}

export async function searchCoupangProducts(keyword: string, limit = 10, callType: CoupangApiCallType = "product-search") {
  const result = await get<{ productData?: CoupangProduct[] }>(buildCoupangSearchPath(keyword, limit), callType);
  return (result.data?.productData ?? []).flatMap(item => {
    const product = normalizeCoupangProduct(item);
    return product ? [product] : [];
  });
}

/**
 * 파트너스 Search API에는 seller-product 상세 조회처럼 vendorItemId를 직접
 * 조회하는 공개 엔드포인트가 없으므로, 상품 ID를 검색어로 넣는 공식 API
 * 재조회만 수행한다. 반환 URL에 itemId/vendorItemId가 포함된 경우에만
 * 후보로 사용하고, 최종 반영은 multiStageSkuMatcher가 옵션까지 재검증한다.
 */
export async function lookupCoupangProductByProductId(productId: string | number, limit = 10) {
  const normalizedProductId = String(productId).trim();
  if (!/^\d+$/.test(normalizedProductId)) return [];
  return searchCoupangProducts(normalizedProductId, limit, "price-tracking");
}

export async function createCoupangDeepLinks(coupangUrls: string[]) {
  const uniqueUrls = normalizeCoupangDeepLinkUrls(coupangUrls);
  if (uniqueUrls.length === 0) return [];
  const result = await post<CoupangDeepLink[]>(DEEP_LINK_PATH, { coupangUrls: uniqueUrls });
  return result.data ?? [];
}

export function normalizeCoupangDeepLinkUrls(coupangUrls: string[]) {
  return Array.from(new Set(coupangUrls.map(url => url.trim()).filter(Boolean))).slice(0, 20);
}
