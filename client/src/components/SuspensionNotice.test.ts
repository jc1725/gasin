import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SuspensionNotice", () => {
  const source = readFileSync(new URL("./SuspensionNotice.tsx", import.meta.url), "utf8");

  it("reads the session-bound suspension status and displays the reason and expected date", () => {
    expect(source).toContain("trpc.auth.suspensionStatus.useQuery");
    expect(source).toContain("정지 사유");
    expect(source).toContain("해제 예정일");
    expect(source).toContain("회원 이용이 정지되었습니다");
  });
});
