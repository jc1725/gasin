import { and, asc, eq, gte, sql } from "drizzle-orm";
import { priceHistory, products } from "../drizzle/schema";
import { getDb } from "./db";

export const SITE_ORIGIN = "https://gasin.shop";
const STATIC_PATHS = ["/", "/guide", "/methodology", "/goldbox", "/hot-deals", "/search"] as const;
const XML_ESCAPE = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
const dateOnly = (value: Date | string | null | undefined) => value ? new Date(value).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

export async function getQualifyingSitemapProducts() {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  return db
    .select({
      id: products.id,
      lastmod: sql<Date>`MAX(${priceHistory.recordedAt})`,
      pointCount: sql<number>`COUNT(${priceHistory.id})`,
    })
    .from(products)
    .innerJoin(priceHistory, and(eq(priceHistory.productId, products.id), gte(priceHistory.recordedAt, since)))
    .where(eq(products.isActive, true))
    .groupBy(products.id)
    .having(sql`COUNT(${priceHistory.id}) >= 3`)
    .orderBy(asc(products.id));
}

function urlEntry(path: string, lastmod: Date | string | null | undefined) {
  return `<url><loc>${XML_ESCAPE(`${SITE_ORIGIN}${path}`)}</loc><lastmod>${dateOnly(lastmod)}</lastmod></url>`;
}

export function buildStaticSitemapXml(now = new Date()) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${STATIC_PATHS.map(path => urlEntry(path, now)).join("")}</urlset>`;
}

export async function buildProductSitemapXml() {
  const rows = await getQualifyingSitemapProducts();
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows.map(row => urlEntry(`/product/${row.id}`, row.lastmod)).join("")}</urlset>`;
}

export function buildSitemapIndexXml(now = new Date()) {
  const entry = (path: string) => `<sitemap><loc>${XML_ESCAPE(`${SITE_ORIGIN}${path}`)}</loc><lastmod>${dateOnly(now)}</lastmod></sitemap>`;
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entry("/sitemap-static.xml")}${entry("/sitemap-products-1.xml")}</sitemapindex>`;
}
