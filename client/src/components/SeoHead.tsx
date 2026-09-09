import { useEffect } from "react";
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

export default function SeoHead({ path, structuredData }: { path: string; structuredData?: object | object[] }) {
  const structuredDataJson = JSON.stringify(structuredData ?? getStructuredDataForPath(path));

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
