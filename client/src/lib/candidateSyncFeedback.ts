export type ResetMutation = () => void;

/** Clears both candidate import feedback channels before a fresh sync. */
export function clearCandidateSyncFeedback(resetCsv: ResetMutation, resetDrive: ResetMutation) {
  resetCsv();
  resetDrive();
}

export function candidateTrackingNotice() {
  return "추적 대기로 보냈습니다. 딥링크가 없으면 다음 승인 API 안전 처리에서 생성하며, 이미 저장된 제휴 링크는 재사용합니다.";
}

export function candidateSyncSuccessNotice(importedCount: number) {
  return `Drive 후보 ${importedCount}건을 동기화했습니다.`;
}
