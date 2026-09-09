import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import superjson from "superjson";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { getStructuredDataForPath, SITE_URL } from "../../client/src/lib/seoMeta";
import { normalizeSsrPath, type HeadMeta } from "../../client/src/ssr/prefetch";
import { buildSsrPrefetch } from "./ssrCaller";

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
const SSR_CACHE_TTL_MS = 30_000;
const SSR_CACHE_MAX_ENTRIES = 64;
const publicSsrCache = new Map<string, { expiresAt: number; status: number; html: string }>();

function getPublicSsrCacheKey(req: express.Request) {
  if (req.method !== "GET" || Object.keys(req.query).length > 0) return null;
  const pathname = new URL(req.originalUrl, "http://localhost").pathname;
  if (pathname === "/" || pathname === "/guide" || pathname === "/methodology" || pathname === "/goldbox" || pathname === "/hot-deals" || /^\/product\/\d+$/.test(pathname)) return pathname;
  return null;
}

function setPublicSsrCache(key: string, entry: { status: number; html: string }) {
  if (publicSsrCache.size >= SSR_CACHE_MAX_ENTRIES) publicSsrCache.delete(publicSsrCache.keys().next().value as string);
  publicSsrCache.set(key, { ...entry, expiresAt: Date.now() + SSR_CACHE_TTL_MS });
}

function clampText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return Array.from(normalized).length <= maxLength ? normalized : `${Array.from(normalized).slice(0, maxLength).join("")}…`;
}

function buildHeadTags(head: HeadMeta, requestPath: string) {
  const title = escapeHtml(clampText(head.title, 70));
  const description = escapeHtml(clampText(head.description, 200));
  const socialTitle = escapeHtml(clampText(head.socialTitle, 70));
  const socialDescription = escapeHtml(clampText(head.socialDescription, 200));
  const canonicalUrl = head.canonicalPath ? `${SITE_URL}${head.canonicalPath}` : "";
  const schemas = getStructuredDataForPath(requestPath, head.structuredData);
  const robots = head.notFound || head.noindex ? "noindex, follow" : "index, follow";
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="가신" />`,
    `<meta property="og:locale" content="ko_KR" />`,
    `<meta property="og:title" content="${socialTitle}" />`,
    `<meta property="og:description" content="${socialDescription}" />`,
    canonicalUrl ? `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />` : "",
    `<meta property="og:image" content="${SITE_URL}/gasyn-icon.png" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${socialTitle}" />`,
    `<meta name="twitter:description" content="${socialDescription}" />`,
    canonicalUrl ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />` : "",
    `<script id="gasyn-page-jsonld" type="application/ld+json">${JSON.stringify(schemas).replace(/</g, "\\u003c")}</script>`,
  ].filter(Boolean).join("\n");
}

function composeHtml(template: string, appHtml: string, head: HeadMeta, url: string, dehydratedState: unknown) {
  const state = JSON.stringify(superjson.serialize(dehydratedState)).replace(/</g, "\\u003c");
  const requestPath = normalizeSsrPath(url);
  return template
    .replace("</body>", () => `<script>window.__RQ_STATE__ = ${state}</script></body>`)
    .replace("<!--app-head-->", () => buildHeadTags(head, requestPath))
    .replace("<!--app-html-->", () => appHtml);
}

export async function setupVite(app: Express, server: Server) {
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: { middlewareMode: true, hmr: { server }, allowedHosts: true },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    try {
      const templatePath = path.resolve(import.meta.dirname, "../..", "client", "index.html");
      let template = await fs.promises.readFile(templatePath, "utf-8");
      template = template.replace(`src="/src/entry-client.tsx"`, `src="/src/entry-client.tsx?v=${nanoid()}"`);
      template = await vite.transformIndexHtml(req.originalUrl, template);
      template = template.replace("</head>", `<link rel="stylesheet" href="/src/index.css?direct" data-ssr-dev-css></head>`);
      const { render } = await vite.ssrLoadModule("/src/entry-server.tsx");
      const prefetch = await buildSsrPrefetch(req, res);
      const rendered = await render(req.originalUrl, prefetch);
      res.status(rendered.head.notFound ? 404 : 200).set("Cache-Control", "no-cache").type("html").end(composeHtml(template, rendered.html, rendered.head, req.originalUrl, rendered.dehydratedState));
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      console.error("[SSR] dev render failed:", error);
      next(error);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = process.env.NODE_ENV === "development" ? path.resolve(import.meta.dirname, "../..", "dist", "public") : path.resolve(import.meta.dirname, "public");
  const serverEntryPath = process.env.NODE_ENV === "development" ? path.resolve(import.meta.dirname, "../..", "dist", "server-ssr", "entry-server.js") : path.resolve(import.meta.dirname, "server-ssr", "entry-server.js");
  const templatePath = path.resolve(distPath, "index.html");

  if (!fs.existsSync(distPath)) {
    console.error("Could not find the build directory, make sure to build the client first");
  }

  app.use((req, res, next) => {
    if (req.path === "/index.html") return res.redirect(301, "/");
    if (req.path !== "/" && req.path.endsWith("/")) {
      const query = req.originalUrl.slice(req.path.length);
      let target = req.path;
      while (target.length > 1 && target.endsWith("/")) target = target.slice(0, -1);
      while (target.startsWith("//")) target = target.slice(1);
      return res.redirect(301, target + query);
    }
    next();
  });

  app.use(express.static(distPath, { index: false, redirect: false }));
  app.use("*", async (req, res) => {
    const cacheKey = getPublicSsrCacheKey(req);
    if (cacheKey) {
      const cached = publicSsrCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        res.status(cached.status).set("Cache-Control", "public, max-age=30, stale-while-revalidate=60").type("html").send(cached.html);
        return;
      }
      if (cached) publicSsrCache.delete(cacheKey);
    }
    try {
      const template = await fs.promises.readFile(templatePath, "utf-8");
      const { render } = await import(serverEntryPath);
      const prefetch = await buildSsrPrefetch(req, res);
      const rendered = await render(req.originalUrl, prefetch);
      const status = rendered.head.notFound ? 404 : 200;
      const html = composeHtml(template, rendered.html, rendered.head, req.originalUrl, rendered.dehydratedState);
      if (cacheKey && status === 200) {
        setPublicSsrCache(cacheKey, { status, html });
        res.status(status).set("Cache-Control", "public, max-age=30, stale-while-revalidate=60").type("html").send(html);
      } else {
        res.status(status).set("Cache-Control", "no-cache").type("html").send(html);
      }
    } catch (error) {
      console.error("[SSR] render failed, serving shell:", error);
      const template = await fs.promises.readFile(templatePath, "utf-8");
      const fallback: HeadMeta = { title: "가신 | 쿠팡 가격 추적", description: "쿠팡 상품의 옵션별 가격 흐름과 최근 수집 관측가를 기록하는 가신 가격 추적 서비스입니다.", socialTitle: "쿠팡 가격, 있는 그대로 믿지 마세요 | 가신", socialDescription: "와우회원가와 옵션별 가격 이력을 비교해 진짜 가격 흐름을 확인하세요.", canonicalPath: "/" };
      res.status(200).set("Cache-Control", "no-cache").type("html").end(composeHtml(template, "", fallback, "/", {}));
    }
  });
}
