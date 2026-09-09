# 쿠팡 API 상세 조회 검토 메모

## 공식 확인 내용

쿠팡 Developer Center의 `Coupang OPEN API` 문서는 상품 조회 API가 판매자 계정의 `sellerProductId`를 조회하는 판매자 Open API임을 설명한다. 해당 문서는 `productId`를 쿠팡에 노출되는 상품 ID, `vendorItemId`를 가장 작은 옵션 단위의 ID로 구분한다.

현재 가신에 설정된 자격 증명은 쿠팡 파트너스 Affiliate API용이며, 판매자 Open API의 sellerProductId 조회 엔드포인트를 호출할 수 있다는 근거는 확인되지 않았다. 따라서 가신에서는 지원되는 파트너스 Search API를 상품 ID 검색어로 1회 제한 재조회하고, 반환된 URL에서 itemId·vendorItemId를 추출한 뒤 상품명·옵션·용량·수량과 함께 최종 검증한다. 파트너스 API가 해당 SKU를 반환하지 않는 경우에는 임의 옵션으로 가격을 반영하지 않고 수집기 확인 대기로 유지한다.

## 출처

- https://developers.coupang.com/en/getting-started/coupang-open-api
- https://developers.coupang.com/en/api/products/querying-product
