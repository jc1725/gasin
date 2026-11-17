import { useEffect, useRef } from "react";
import { getPageMeta, getStructuredDataForPath, SITE_URL } from "@/lib/seoMeta";

function setMeta(name: string, content: string) {
  let meta = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function setPropertyMeta(property: string, content: string) {
  let meta = document.head.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("property", property);
    document.head.appendChild(meta);
  }
  meta.content = content;
}

/**
 * 첫 하이드레이션에서는 서버가 넣은 JSON-LD를 그대로 둔다. 서버 스크립트에는 페이지별 데이터
 * (예: /deals/* 의 ItemList)가 들어 있는데, 클라이언트는 경로만으로 만든 기본 스키마를 쓰므로
 * 덮어쓰면 JS를 실행하는 크롤러가 보는 DOM에서 그 데이터가 사라진다.
 */
export function shouldKeepServerJsonLd(isFirstRun: boolean, hasServerScript: boolean, hasExplicitData: boolean) {
  return isFirstRun && hasServerScript && !hasExplicitData;
}

export default function SeoHead({ path, structuredData }: { path: string; structuredData?: object | object[] }) {
  const structuredDataJson = JSON.stringify(structuredData ?? getStructuredDataForPath(path));
  const hydratedRef = useRef(false);

  useEffect(() => {
    const meta = getPageMeta(path);
    document.title = meta.title;
    setMeta("description", meta.description);
    setPropertyMeta("og:title", meta.socialTitle);
    setPropertyMeta("og:description", meta.socialDescription);
    setPropertyMeta("og:url", `${SITE_URL}${path}`);
    setPropertyMeta("og:site_name", "가신");
    setPropertyMeta("og:locale", "ko_KR");
    setMeta("twitter:card", "summary");
    setMeta("twitter:title", meta.socialTitle);
    setMeta("twitter:description", meta.socialDescription);

    let canonical = document.head.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `${SITE_URL}${path}`;
  }, [path]);

  useEffect(() => {
    if (!structuredDataJson) return;
    const isFirstRun = !hydratedRef.current;
    hydratedRef.current = true;
    if (shouldKeepServerJsonLd(isFirstRun, Boolean(document.head.querySelector("#gasyn-page-jsonld")), structuredData !== undefined)) return;
    const script = document.createElement("script");
    script.id = "gasyn-page-jsonld";
    script.type = "application/ld+json";
    script.textContent = structuredDataJson;
    document.head.querySelector("#gasyn-page-jsonld")?.remove();
    document.head.appendChild(script);
    return () => script.remove();
  }, [structuredDataJson]);

  return null;
}
