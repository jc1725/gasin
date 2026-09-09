import { describe, expect, it, vi } from "vitest";
import { candidateSyncSuccessNotice, candidateTrackingNotice, clearCandidateSyncFeedback } from "./candidateSyncFeedback";

describe("candidate sync feedback", () => {
  it("clears both CSV and Drive mutation feedback before a new sync", () => {
    const resetCsv = vi.fn();
    const resetDrive = vi.fn();
    clearCandidateSyncFeedback(resetCsv, resetDrive);
    expect(resetCsv).toHaveBeenCalledOnce();
    expect(resetDrive).toHaveBeenCalledOnce();
  });

  it("keeps success and delayed deep-link policy copy aligned with the UI flow", () => {
    expect(candidateSyncSuccessNotice(2)).toBe("Drive 후보 2건을 동기화했습니다.");
    expect(candidateTrackingNotice()).toContain("다음 승인 API 안전 처리에서 생성");
    expect(candidateTrackingNotice()).toContain("이미 저장된 제휴 링크는 재사용");
  });
});
