import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { siteOrganizationSchema, siteWebApplicationSchema, snsShareCopy } from "@/lib/guideContent";
import { methodologyWebPageSchema } from "@/lib/methodologyContent";

const root = process.cwd();
const html = fs.readFileSync(path.join(root, "client/index.html"), "utf8");
const robots = fs.readFileSync(path.join(root, "client/public/robots.txt"), "utf8");
const sitemap = fs.readFileSync(path.join(root, "client/public/sitemap.xml"), "utf8");
const app = fs.readFileSync(path.join(root, "client/src/App.tsx"), "utf8");
const serverEntry = fs.readFileSync(path.join(root, "client/src/entry-server.tsx"), "utf8");
const htmlDelivery = fs.readFileSync(path.join(root, "server/_core/vite.ts"), "utf8");
const serverIndex = fs.readFileSync(path.join(root, "server/_core/index.ts"), "utf8");
const seoMeta = fs.readFileSync(path.join(root, "client/src/lib/seoMeta.ts"), "utf8");
const imageProxy = fs.readFileSync(path.join(root, "server/imageProxy.ts"), "utf8");

describe("GEO·SEO 기반 파일", () => {
  it("Organization·가격 추적 WebApplication 스키마를 제공한다", () => {
    expect(siteOrganizationSchema["@type"]).toBe("Organization");
    expect(siteOrganizationSchema.url).toBe("https://gasin.shop");
    expect(siteWebApplicationSchema["@type"]).toBe("WebApplication");
    expect(siteWebApplicationSchema.applicationCategory).toBe("ShoppingApplication");
    expect(html).toContain("<!--app-head-->");
    expect(html).toContain("<!--app-html-->");
    expect(html).toContain('src="/src/entry-client.tsx"');
    expect(serverEntry).toContain("renderToString");
    expect(htmlDelivery).toContain('type="application/ld+json"');
    expect(htmlDelivery).toContain("getStructuredDataForPath");
    expect(snsShareCopy.headline).toContain("가신이 대신 해독합니다");
    expect(seoMeta).toContain('seller: { "@type": "Organization", name: "쿠팡" }');
    expect(seoMeta).toContain('"@type": "BreadcrumbList"');
  });

  it("색인 허용 robots와 공개 가이드·방법론이 포함된 사이트맵을 제공한다", () => {
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://gasin.shop/sitemap.xml");
    expect(sitemap).toContain("https://gasin.shop/guide");
    expect(sitemap).toContain("https://gasin.shop/goldbox");
    expect(sitemap).toContain("https://gasin.shop/methodology");
    expect(app).toContain('path={"/methodology"}');
    expect(methodologyWebPageSchema.url).toBe("https://gasin.shop/methodology");
    expect(seoMeta).toContain('labels: Record<string, string> = { "/guide": "가격 가이드"');
    expect(serverIndex).toContain('Content-Security-Policy');
    expect(serverIndex).toContain('X-Frame-Options');
    expect(serverIndex).toContain('Referrer-Policy');
    expect(serverIndex).toContain('Permissions-Policy');
    expect(imageProxy).toContain('.webp({ quality: 72');
  });

  // 2026-11-09: 실제 방문 확인용 Google Tag Manager(GA4). <head> 첫머리 스크립트 + <body> noscript, CSP 허용.
  it("Google Tag Manager 컨테이너를 head 맨 앞에 설치하고 CSP가 허용한다", () => {
    expect(html).toContain("GTM-WNHDVS87");
    expect(html.indexOf("googletagmanager.com/gtm.js")).toBeGreaterThan(html.indexOf("<head>"));
    expect(html.indexOf("googletagmanager.com/gtm.js")).toBeLessThan(html.indexOf("<meta charset"));
    expect(html).toContain("googletagmanager.com/ns.html?id=GTM-WNHDVS87");
    expect(serverIndex).toMatch(/script-src[^;]*https:\/\/www\.googletagmanager\.com/);
    expect(serverIndex).toMatch(/frame-src[^;]*https:\/\/www\.googletagmanager\.com/);
  });
});
