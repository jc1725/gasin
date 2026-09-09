# 개인 Google Drive OAuth 구현 메모

개인 Google 계정의 Drive 저장공간을 사용하려면 서비스 계정이 아니라 사용자 OAuth 권한이 필요하다. Google의 웹 서버 OAuth 안내는 사용자 동의 뒤 권한 코드를 교환하고, `access_type=offline`으로 장기 작업에 필요한 갱신 토큰을 얻는 흐름을 설명한다. 갱신 토큰은 안전한 장기 저장소에 보관해야 한다.

가신은 최소 권한인 `https://www.googleapis.com/auth/drive.file`을 요청한다. 이 범위는 앱이 만든 파일을 생성·수정하는 용도이며, 전체 Drive 접근 범위를 요청하지 않는다. 상품 목록 JSON은 작은 파일이므로 파일 메타데이터와 본문을 함께 전송하는 `uploadType=multipart` 방식으로 생성하고, 이후에는 저장한 파일 ID로 내용을 갱신한다.

| 설계 항목 | 적용 방식 |
| --- | --- |
| 사용자 동의 | 별도 개인 Drive 연결 경로에서 incremental OAuth 동의 요청 |
| 최소 권한 | `drive.file` |
| 장기 실행 | `access_type=offline`, `prompt=consent`, 암호화된 refresh token 저장 |
| 저장 위치 | 환경에 지정된 개인 Drive 폴더 또는 root |
| 파일 갱신 | 최초 생성 후 `snapshotFileId`로 PATCH 업로드 |

## 참고 자료

1. [Google OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server)
2. [Google Drive API-specific authorization](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
3. [Google Drive API uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
