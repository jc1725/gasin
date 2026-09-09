import type { QueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { TRPCError } from "@trpc/server";
import { trpc } from "@/lib/trpc";
import { getPageMeta, getProductPageMeta, SITE_OG_IMAGE } from "@/lib/seoMeta";

export type HeadMeta = {
  title: string;
  description: string;
  socialTitle: string;
  socialDescription: string;
  canonicalPath?: string;
  noindex?: boolean;
  notFound?: boolean;
  structuredData?: object[];
};

export type SsrPrefetch = {
  siteStats: () => Promise<unknown>;
  homeFeatured: (input: { limit: number }) => Promise<unknown>;
  listProducts: (input: { source?: "goldbox" | "search" | "bestcategory" | "collection"; limit?: number }) => Promise<unknown>;
  hotDeals: () => Promise<unknown>;
  product: (input: { productId: number }) => Promise<unknown>;
  collectedPriceHistory: (input: { productId: number }) => Promise<unknown>;
  relatedVariants: (input: { productId: number }) => Promise<unknown>;
};

async function seed(queryClient: QueryClient, key: unknown, data: unknown) {
  queryClient.setQueryData<unknown>(key as readonly unknown[], data);
}

function knownPath(path: string) {
  return path === "/" || path === "/guide" || path === "/methodology" || path === "/goldbox" || path === "/hot-deals" || path === "/favorites" || path === "/search" || /^\/product\/\d+$/.test(path) || path === "/admin" || path.startsWith("/admin/");
}

export function normalizeSsrPath(url: string) {
  const rawPath = url.split("?")[0];
  let decodedPath = rawPath;
  try {
    decodedPath = decodeURI(rawPath);
  } catch {
    // Use the raw request path when it contains an invalid URI sequence.
  }
  return decodedPath.replace(/\/+$/, "") || "/";
}

export async function prefetchForPath(url: string, queryClient: QueryClient, prefetch: SsrPrefetch): Promise<HeadMeta> {
  const path = normalizeSsrPath(url);
  const pageMeta = getPageMeta(path);

  if (path === "/") {
    const [stats, featured] = await Promise.all([
      prefetch.siteStats(),
      prefetch.homeFeatured({ limit: 50 }),
    ]);
    await Promise.all([
      seed(queryClient, getQueryKey(trpc.siteStats.public, undefined, "query"), stats),
      seed(queryClient, getQueryKey(trpc.catalog.homeFeatured, { limit: 50 }, "query"), featured),
    ]);
  }

  if (path === "/guide" || path === "/methodology") {
    const stats = await prefetch.siteStats();
    await seed(queryClient, getQueryKey(trpc.siteStats.public, undefined, "query"), stats);
  }

  if (path === "/goldbox") {
    const input = { source: "goldbox" as const, limit: 100 };
    const products = await prefetch.listProducts(input);
    await seed(queryClient, getQueryKey(trpc.catalog.list, input, "query"), products);
  }

  if (path === "/hot-deals") {
    const deals = await prefetch.hotDeals();
    await seed(queryClient, getQueryKey(trpc.hotDeals.list, undefined, "query"), deals);
  }

  const productMatch = path.match(/^\/product\/(\d+)$/);
  if (productMatch) {
    const input = { productId: Number(productMatch[1]) };
    try {
      const [detail, collectedHistory, relatedVariants] = await Promise.all([
        prefetch.product(input),
        prefetch.collectedPriceHistory(input),
        prefetch.relatedVariants(input),
      ]);
      await Promise.all([
        seed(queryClient, getQueryKey(trpc.catalog.product, input, "query"), detail),
        seed(queryClient, getQueryKey(trpc.catalog.collectedPriceHistory, input, "query"), collectedHistory),
        seed(queryClient, getQueryKey(trpc.catalog.relatedVariants, input, "query"), relatedVariants),
      ]);
      const detailRecord = detail as { product?: { id: number; name: string; currentPrice: number; lowestPrice: number; inStock: boolean; imageUrl?: string | null }; history?: Array<{ price: number; recordedAt: Date | string }> } | null;
      if (detailRecord?.product) {
        const collectedRecords = (collectedHistory as Array<{ price?: number | null; collectedAt: Date | string }>).flatMap(point => point.price && point.price > 0 ? [{ price: point.price, recordedAt: point.collectedAt }] : []);
        return getProductPageMeta(detailRecord.product, [...(detailRecord.history ?? []), ...collectedRecords]);
      }
    } catch (error) {
      if (error instanceof TRPCError && error.code === "NOT_FOUND") return { ...pageMeta, notFound: true };
      throw error;
    }
  }

  if (!knownPath(path)) {
    return { ...pageMeta, notFound: true };
  }

  if (path === "/favorites" || path === "/admin" || path.startsWith("/admin/")) {
    return { ...pageMeta, noindex: true };
  }

  return { ...pageMeta, canonicalPath: path, ogImage: SITE_OG_IMAGE } as HeadMeta;
}
