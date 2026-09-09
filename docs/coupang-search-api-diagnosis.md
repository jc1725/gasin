# 쿠팡 검색 API 진단 참고

- 참고 구현: <https://github.com/mooooburg-dev/coupang-partners-sdk-standalone>
- 확인 시각: 2026-08-18 KST

공개 TypeScript SDK의 문서는 상품 검색을 `searchProducts('아이폰', { limit: 10, imageSize: '230x230' })`처럼 키워드·결과 수·이미지 크기로 호출하며, 응답 데이터는 `data.productData`에 있다고 설명한다. 현재 가신도 같은 경로와 응답 필드 형태를 사용한다.

가신의 실제 단일 진단 호출에서 `케라스타즈` 검색은 코카콜라·라면 등 무관한 기본 상품 10개를 반환했다. 따라서 화면의 빈 결과는 관련도 필터의 과잉 제거만이 아니라, 공식 API가 현재 키워드를 반영하지 않은 결과를 반환한 데서도 발생한다. 다음 수정은 요청·서명 구성과 API 응답 검증을 강화하고 무관 결과를 캐시하지 않도록 해야 한다.

## 참고 SDK 요청 구성 대조

참고 SDK의 `ProductsAPI.search()`는 `/v2/providers/affiliate_open_api/apis/openapi/products/search` 경로에 다음 쿼리 객체를 전달한다.

| 항목 | 값 |
| --- | --- |
| `keyword` | 공백을 제거한 사용자 검색어 |
| `limit` | 기본 10 |
| `imageSize` | 기본 `230x230` |
| `srpLinkOnly` | 기본 `false` |

가신의 기존 호출에는 `imageSize`와 `srpLinkOnly`가 빠져 있다. 문서상 기본값으로 처리될 가능성이 높지만, 응답이 기본 상품으로 고정되는 현상을 피하기 위해 해당 필드를 명시하고, 요청 URL·응답 키워드 일치 여부를 서버에서 검증하도록 보완한다.

참고 SDK의 공통 요청 계층도 `URLSearchParams`로 쿼리를 만든 뒤 `pathname + search` 전체를 HMAC 서명 문자열에 포함한다. 이 방식은 가신의 현재 서명 규칙과 동일하다. 따라서 즉시 수정할 수 있는 부분은 `srpLinkOnly=false` 명시, 응답의 관련성 검증, 무관한 API 응답의 저장 방지, 빈 결과 캐시의 즉시 폐기다. API가 키워드를 무시한 응답을 계속 보낼 때에는 관련 없는 상품을 표시하지 않고 명시적인 API 응답 안내를 제공해야 한다.

## 실제 단일 호출 재검증

`srpLinkOnly=false`를 명시한 뒤에도 `케라스타즈`와 `kerastase` 요청은 각각 두피 앰플 또는 무관한 기본 상품을 반환했다. 반면 `아이폰` 요청은 아이폰 17 Pro·아이폰 액세서리 등 관련 결과를 반환했다. 즉, 현재 API 인증·쿼리 구성 전체가 고장 난 것이 아니라 특정 브랜드 검색어에 대해 공식 API가 관련 상품을 제공하지 않는 상황이다.
