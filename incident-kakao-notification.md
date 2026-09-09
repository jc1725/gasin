# 카카오톡 인앱 브라우저 오류 진단 메모

- 사용자가 보고한 오류: `ReferenceError: Notification is not defined`.
- 사용자 오류에 표시된 구버전 자산: `https://gasin.shop/assets/index-Cor01e48.js`.
- 2026-08-28 운영 홈을 실제로 열어 확인한 현재 로드 자산: `https://gasin.shop/assets/index-Bwu9mH0i.js`.
- 현재 소스와 최신 빌드는 `window.Notification` 접근과 `Notification` API 존재 여부를 먼저 확인하도록 수정되어 있다.
- 최신 운영 홈은 정상으로 열렸고, 카카오톡 인앱 브라우저에서는 푸시 API가 없어도 페이지 렌더링이 중단되지 않아야 한다.
- 사용자 기기에서 구버전 `index-Cor01e48.js`가 계속 보이면 브라우저·카카오톡 인앱 캐시 또는 이전 배포 응답이 원인일 가능성이 있으므로 강력 새로고침/외부 브라우저 재접속으로 확인한다.
- Source URL: https://gasin.shop/
