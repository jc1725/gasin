# GEO·SEO 구현 메모

- 구조화 데이터는 해당 페이지에 실제로 표시되는 정확한 콘텐츠를 설명해야 한다.
- JSON-LD는 유지보수하기 쉬운 구조화 데이터 형식으로 권장된다.
- 스키마 속성은 많이 넣기보다 정확하고 완전하게 제공한다.
- 배포 전 구조화 데이터 검증 도구로 확인하고, 배포 후 Search Console에서 상태를 모니터링한다.
- 공개 페이지 URL을 XML 사이트맵에 넣고 robots.txt에서 사이트맵 위치를 알린다.

## 공식 가이드 재확인

- 구조화 데이터는 적용 대상 페이지의 실제 공개 내용을 설명해야 하며, 스키마만을 위한 빈 페이지나 화면에 보이지 않는 정보의 마크업은 피한다.
- JSON-LD는 유효하고 유지보수하기 쉬운 형식으로 권장되지만, 풍부한 검색결과나 AI 인용을 보장하지 않는다.
- 사이트맵에는 중요한 정규(canonical) URL만 포함하고, 배포 뒤에는 Search Console에서 유효성·색인 상태를 확인한다.

참고: [Google Search Central 구조화 데이터 소개](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data), [사이트맵 작성·제출 가이드](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) (2026-08-28 재확인).

## 2026-08-28 구현 검증

- `/guide`와 `/methodology`는 서버 렌더링된 본문, 경로별 title·description·Open Graph·Twitter·canonical, 해당 본문과 동일한 JSON-LD를 함께 응답한다.
- 운영 빌드의 `/methodology`와 `/guide`는 HTTP 200, 존재하지 않는 경로는 HTTP 404 및 `noindex, follow`를 확인했다.
- `robots.txt`의 사이트맵 선언과 `/sitemap.xml`의 `/methodology` 정규 URL을 확인했으며, 데스크톱·375px 모바일 화면에서 가이드와 CTA의 읽기성을 점검했다.
