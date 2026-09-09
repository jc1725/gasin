# 코드 리뷰 수정안 적용 기록

첨부된 `gasyn-code-review-fixes.md`는 세 가지 작업을 제안한다.

1. `server/multiStageSkuMatcher.ts`와 `server/coupang.ts`의 정규식 리터럴에서 이중 백슬래시로 작성된 `\\s`, `\\d`를 실제 공백·숫자 정규식인 `\s`, `\d`로 수정한다. 대상은 공백 정규화, 상품명 8단어 축약, 상품 ID 숫자 검증이다.
2. `server/db.ts`에서 수집기 SKU 우선 이관과 관리자 상품 병합에 중복된 즐겨찾기·카테고리 이관 로직을 공용 헬퍼로 통합한다.
3. `server/db.ts`에 MySQL ResultSetHeader의 `affectedRows`를 추출하는 모듈 공용 helper를 만들고 반복되는 타입 단언·지역 helper를 통합한다.

검증 기준은 관련 Vitest, `tsc --noEmit`, 전체 테스트, 운영 빌드 및 의도하지 않은 변경 검토다. 이 문서는 수정안의 외부 지시 내용을 보존하기 위한 기록이며, 실제 적용 여부는 현재 저장소 코드와 테스트 결과를 기준으로 판단한다.
