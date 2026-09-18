import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logError, logInfo, logWarn } from "./log";

// 2026-09-18: "가신 코딩 스킬 다이제스트" 관측성 항목 적용 — 여러 진입점(스케줄러/외부
// cron/수집기 확장)에서 어느 경로로 들어왔는지 구조화된 필드로 남기기 위한 헬퍼.
// db.ts와 달리 DB 연결이 필요 없는 순수 함수라 실제로 호출해 console 출력을 검증한다
// (다른 테스트 파일들의 "소스 텍스트 패턴 매칭" 방식과는 다름 — 이 파일은 그럴 필요가 없음).
describe("구조화 로그 헬퍼 (server/_core/log.ts)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("logInfo는 console.log에 level/event/route/ts와 필드를 담은 유효한 JSON 한 줄을 출력한다", () => {
    logInfo("scheduled_job_start", "scheduler", { jobKey: "goldbox" });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("info");
    expect(parsed.event).toBe("scheduled_job_start");
    expect(parsed.route).toBe("scheduler");
    expect(parsed.jobKey).toBe("goldbox");
    expect(typeof parsed.ts).toBe("string");
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logWarn은 console.warn을 쓴다", () => {
    logWarn("collect_payload_invalid", "collector_extension", { itemCount: 3 });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("warn");
    expect(parsed.route).toBe("collector_extension");
    expect(parsed.itemCount).toBe(3);
  });

  it("logError는 Error 인스턴스에서 message/name만 뽑아 담는다 (순환 참조로 JSON.stringify가 깨지는 것 방지)", () => {
    const circular: Record<string, unknown> = { self: null };
    circular.self = circular;
    const error = new Error("DB 연결 실패");
    (error as Error & { circular?: unknown }).circular = circular;

    logError("collect_batch_failed", "collector_extension", error, { itemCount: 5 });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = errorSpy.mock.calls[0][0] as string;
    // 순환 참조 객체가 담긴 error 전체가 아니라 message/name만 직렬화되므로 stringify가 던지지 않는다.
    expect(() => JSON.parse(line)).not.toThrow();
    const parsed = JSON.parse(line);
    expect(parsed.errorMessage).toBe("DB 연결 실패");
    expect(parsed.errorName).toBe("Error");
    expect(parsed.itemCount).toBe(5);
    expect(parsed.circular).toBeUndefined();
  });

  it("logError는 Error가 아닌 값도 안전하게 문자열로 담는다", () => {
    logError("collect_batch_failed", "scheduler", "문자열 에러", { jobKey: "price" });
    const parsed = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(parsed.errorMessage).toBe("문자열 에러");
    expect(parsed.errorName).toBeUndefined();
  });
});
