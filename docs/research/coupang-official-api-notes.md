# 쿠팡 공식 API 아키텍처 조사 메모

조사일: 2026-08-14

- 쿠팡의 공식 CPI 문서 사이트는 `partner-developers.coupangcorp.com`이며, API 문서·시작 가이드·워크플로·FAQ를 제공한다.
- 공식 API 문서 카테고리 페이지에서 공개적으로 노출된 하위 문서는 현재 제한적이어서, 기능·쿼터·상품 단건 또는 일괄 조회 가능 여부는 계정별 파트너스 콘솔 및 지원 채널에서 재확인이 필요하다.
- 공식 문서 사이트 내 `GoldBox 상품 검색 딥링크` 통합 검색은 결과를 반환하지 않았다. 따라서 검색 결과가 없다는 사실만으로 기능 부재를 단정하지 않는다.
- 본 서비스의 아키텍처 권고는 승인된 문서 또는 쿠팡 담당자가 확인한 엔드포인트만 사용하며, 비공개 엔드포인트·크롤링·접근 통제 우회는 배제한다.

쿠팡 Developer Center의 2026-05-28 Open API 안내도 확인했다. 이 API는 WING 판매자 계정과 Open API Key를 전제로 하며, 상품 등록·조회·수정, 주문·배송, 프로모션·쿠폰, 정산 같은 판매자 운영 기능을 제공한다. API 문서의 상품 조회·가격 변경은 판매자가 운영하는 상품을 대상으로 한다. 따라서 임의의 쿠팡 파트너스 링크 상품이나 다수 판매자의 공개 판매가를 읽는 일반 가격 추적 데이터 소스로 간주하면 안 된다.

공식 출처:

- https://partner-developers.coupangcorp.com/hc/ko/categories/360005470572-API-Docs
- https://developers.coupang.com/ko/getting-started/coupang-open-api
- https://developers.coupang.com/ko/api
