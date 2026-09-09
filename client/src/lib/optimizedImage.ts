export function getOptimizedProductImageUrl(imageUrl: string | null | undefined, width = 312) {
  if (!imageUrl) return "";
  try {
    const source = new URL(imageUrl);
    if (source.protocol !== "https:") return imageUrl;
    const isCoupang = source.hostname === "ads-partners.coupang.com" || source.hostname.endsWith(".coupangcdn.com") || source.hostname === "coupangcdn.com";
    if (!isCoupang) return imageUrl;
    return `/api/image-proxy?url=${encodeURIComponent(source.toString())}&w=${Math.max(48, Math.min(640, width))}`;
  } catch {
    return imageUrl;
  }
}
