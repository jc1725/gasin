import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("AdminMembers management screen", () => {
  const source = readFileSync(new URL("./AdminMembers.tsx", import.meta.url), "utf8");

  it("lists members with login method and account activity information", () => {
    expect(source).toContain("trpc.members.list.useQuery");
    expect(source).toContain("가입");
    expect(source).toContain("최근 로그인");
    expect(source).toContain('loginMethod === "kakao"');
  });

  it("limits administrator role changes to the designated owner and Google accounts", () => {
    expect(source).toContain("isAdminEmail(user?.email)");
    expect(source).toContain('member.loginMethod !== "google"');
    expect(source).toContain("trpc.members.setRole.useMutation");
  });

  it("shows a suspension reason and uses the protected suspension mutation", () => {
    expect(source).toContain("trpc.members.setSuspension.useMutation");
    expect(source).toContain("이용정지 사유를 입력하세요");
    expect(source).toContain("해제 예정일 (필수)");
    expect(source).toContain("suspensionEndsAt");
    expect(source).toContain("이용 정지");
    expect(source).toContain("이용정지 해제");
  });
});
