// 2026-10-14: 특가 이미지 주소를 넣어도 깨진 아이콘으로 보이는 문제.
// - 이미지 서버(스마트스토어·쇼핑 CDN 등)가 다른 사이트에서 온 요청(Referer)을 막는 경우가 많아,
//   <img>에 referrerPolicy="no-referrer"를 줘서 Referer를 보내지 않는다.
// - http 주소는 CSP(img-src https:)에 막히므로 https로 올려서 요청한다.
// - 이미지가 아닌 일반 페이지 주소를 넣은 경우는 관리자 입력 화면에서 미리보기 실패로 알려 준다.
// 구글 드라이브 "공유 링크"(drive.google.com/file/d/ID/view, open?id=ID, uc?id=ID)는 이미지 파일이 아니라
// 미리보기 페이지라서 <img>로 불러올 수 없다. 파일 ID를 뽑아 이미지 직접 주소(lh3.googleusercontent.com/d/ID)로 바꾼다.
// 파일이 "링크가 있는 모든 사용자 - 뷰어"로 공유돼 있어야 보인다.
export function getGoogleDriveFileId(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.hostname !== "drive.google.com" && url.hostname !== "docs.google.com") return null;
    const fromPath = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/);
    if (fromPath) return fromPath[1]!;
    const fromQuery = url.searchParams.get("id");
    return fromQuery && /^[A-Za-z0-9_-]{10,}$/.test(fromQuery) ? fromQuery : null;
  } catch {
    return null;
  }
}

export function normalizeHotDealImageUrl(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  const driveId = getGoogleDriveFileId(trimmed);
  if (driveId) return `https://lh3.googleusercontent.com/d/${driveId}`;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, "https://");
  return trimmed;
}

/** 입력한 주소가 이미지 파일 주소처럼 보이는지(확실치 않으면 true). 쿼리스트링이 붙은 CDN 주소도 통과시킨다. */
export function looksLikeHotDealPageUrl(value: string) {
  try {
    const url = new URL(normalizeHotDealImageUrl(value));
    const host = url.hostname;
    if (/(^|\.)(smartstore\.naver\.com|brand\.naver\.com|shopping\.naver\.com|search\.shopping\.naver\.com|naver\.me)$/i.test(host)) return true;
    if (/(^|\.)coupang\.com$/i.test(host) && !/\.(jpe?g|png|webp|gif|avif)$/i.test(url.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}
