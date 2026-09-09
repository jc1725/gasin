export function describeDeepLinkFailure(reason: string | null | undefined) {
  const value = reason?.trim() || "";
  if (value.includes("정확 SKU 미확인")) {
    return {
      title: "정확 SKU를 공식 결과에서 찾지 못함",
      detail: "최근 수집기 관측도 없어서 다른 옵션으로 이동하지 않도록 기존 링크를 숨겼습니다.",
      action: "수집기에서 이 옵션을 다시 열어 itemId·vendorItemId·가격을 전송한 뒤 딥링크 갱신을 누르세요.",
    };
  }
  if (value.includes("원본 URL 문제")) {
    return {
      title: "원본 쿠팡 URL을 사용할 수 없음",
      detail: "딥링크 생성에는 쿠팡 상품 URL과 정확한 옵션 정보가 필요합니다.",
      action: "수집기에서 쿠팡 상품 페이지를 다시 열어 정확 SKU URL을 전송하세요.",
    };
  }
  if (value.includes("딥링크 생성 결과가 없습니다")) {
    return {
      title: "쿠팡 딥링크 생성 결과 없음",
      detail: "정확 SKU는 확인됐지만 쿠팡이 새 제휴 링크를 반환하지 않았습니다.",
      action: "잠시 후 딥링크 갱신을 다시 시도하거나 수집기로 옵션을 재확인하세요.",
    };
  }
  return {
    title: "딥링크 생성 상태 확인 필요",
    detail: value || "저장된 딥링크가 없습니다.",
    action: "딥링크 갱신을 시도하고, 계속 실패하면 수집기로 정확 옵션을 다시 관측하세요.",
  };
}
