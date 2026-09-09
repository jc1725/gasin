import crypto from "node:crypto";

export type ParsedCoupangLink = {
  submittedUrl: string;
  linkKey: string;
  externalProductId: string;
};

type LinkResolver = (input: string, init?: RequestInit) => Promise<Pick<Response, "headers" | "status">>;

function isCoupangHost(host: string) {
  return host === "coupang.com" || host.endsWith(".coupang.com");
}

function parseTrustedCoupangUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("올바른 URL을 입력해 주세요.");
  }
  if (url.protocol !== "https:" || !isCoupangHost(url.hostname.toLowerCase())) {
    throw new Error("쿠팡 또는 쿠팡 파트너스 HTTPS 링크만 등록할 수 있습니다.");
  }
  return url;
}

function getManualExternalProductId(url: URL) {
  const pageKey = url.searchParams.get("pageKey") ?? url.pathname.match(/\/products\/(\d+)/)?.[1];
  const productId = Number(pageKey);
  if (!Number.isInteger(productId) || productId <= 0) {
    throw new Error("링크에서 쿠팡 상품 식별자를 찾지 못했습니다. 상품 또는 파트너스 링크 전체를 입력해 주세요.");
  }
  const itemId = url.searchParams.get("itemId")?.trim();
  const vendorItemId = url.searchParams.get("vendorItemId")?.trim();
  if (itemId && vendorItemId) return `${productId}:${itemId}:${vendorItemId}`;
  if (itemId) return `${productId}:${itemId}`;
  return `${productId}:url-${crypto.createHash("sha256").update(`${url.pathname}?${url.searchParams.get("pageKey") ?? ""}`).digest("hex").slice(0, 16)}`;
}

function parseCoupangUrls(submittedUrl: URL, targetUrl: URL): ParsedCoupangLink {
  const normalizedUrl = submittedUrl.toString();
  return {
    submittedUrl: normalizedUrl,
    linkKey: crypto.createHash("sha256").update(normalizedUrl).digest("hex").slice(0, 64),
    externalProductId: getManualExternalProductId(targetUrl),
  };
}

export function parseCoupangLink(submittedUrl: string): ParsedCoupangLink {
  const url = parseTrustedCoupangUrl(submittedUrl);
  return parseCoupangUrls(url, url);
}

export async function resolveCoupangLink(submittedUrl: string, fetcher: LinkResolver = fetch): Promise<ParsedCoupangLink> {
  const shortUrl = parseTrustedCoupangUrl(submittedUrl);
  if (shortUrl.hostname.toLowerCase() !== "link.coupang.com" || !shortUrl.pathname.startsWith("/a/")) {
    return parseCoupangUrls(shortUrl, shortUrl);
  }

  let response: Pick<Response, "headers" | "status">;
  try {
    response = await fetcher(shortUrl.toString(), {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "GasynPartnerLinkVerifier/1.0" },
    });
  } catch {
    throw new Error("쿠팡 파트너스 단축 링크를 확인하지 못했습니다. 잠시 후 다시 시도하거나 쿠팡 상품 전체 링크를 입력해 주세요.");
  }

  const location = response.headers.get("location");
  if (response.status < 300 || response.status >= 400 || !location) {
    throw new Error("쿠팡 파트너스 단축 링크의 상품 주소를 찾지 못했습니다. 쿠팡 상품 전체 링크를 입력해 주세요.");
  }
  const targetUrl = parseTrustedCoupangUrl(new URL(location, shortUrl).toString());
  return parseCoupangUrls(shortUrl, targetUrl);
}
