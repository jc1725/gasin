export function describeRecheckReason(reason: string | null | undefined) {
  const value = reason?.trim() ?? "";
  if (!value) return "최근 가격 확인 시간이 지나 순차 재확인을 기다립니다.";
  if (value.includes("정확 SKU") || value.includes("productId·itemId·vendorItemId")) {
    return "정확 SKU를 찾지 못해 수집기 관측을 기다립니다.";
  }
  if (value.includes("예산") || value.includes("보호")) {
    return "쿠팡 API 호출 예산 보호 후 다음 순번에 재확인합니다.";
  }
  if (value.includes("관리자 전체") || value.includes("전체 재확인")) {
    return "관리자 전체 재확인 대기열에 등록되어 순차 처리됩니다.";
  }
  if (value.includes("24시간")) return "24시간 재확인 주기에 따라 다음 순번을 기다립니다.";
  return value.length > 90 ? `${value.slice(0, 90)}…` : value;
}
