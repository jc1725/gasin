const SEARCH_SNAPSHOT_PREFIX = "gasyn-search-results:";

export function getSearchKeywordFromLocation(location: string) {
  const queryStart = location.indexOf("?");
  if (queryStart < 0) return "";
  return new URLSearchParams(location.slice(queryStart + 1)).get("q")?.trim() ?? "";
}

export function getSearchLocation(keyword: string) {
  return `/search?q=${encodeURIComponent(keyword.trim())}`;
}

export function loadSearchSnapshot<T>(keyword: string): T | null {
  if (!keyword || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${SEARCH_SNAPSHOT_PREFIX}${keyword}`);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

export function saveSearchSnapshot<T>(keyword: string, result: T) {
  if (!keyword || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${SEARCH_SNAPSHOT_PREFIX}${keyword}`, JSON.stringify(result));
  } catch {
    // 저장 공간 제한이나 브라우저 개인 정보 모드에서는 URL 검색어만 유지한다.
  }
}
