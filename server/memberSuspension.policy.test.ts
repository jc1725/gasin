import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authSdk = readFileSync(new URL("./_core/sdk.ts", import.meta.url), "utf8");
const membersRouter = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("member suspension policy", () => {
  it("rejects suspended accounts before authenticated features receive a user", () => {
    expect(authSdk).toContain("if (user.isSuspended)");
    expect(authSdk).toContain('ForbiddenError("Account suspended")');
  });

  it("requires the designated owner, a reason, and a non-admin member for suspension", () => {
    expect(membersRouter).toContain("setSuspension: adminProcedure");
    expect(membersRouter).toContain("지정 관리자만 회원 이용정지를 변경할 수 있습니다.");
    expect(membersRouter).toContain("관리자 권한을 해제한 뒤 이용정지할 수 있습니다.");
    expect(membersRouter).toContain("이용정지를 해제한 뒤 관리자 권한을 지정할 수 있습니다.");
    expect(membersRouter).toContain("이용정지 사유를 입력해 주세요.");
    expect(membersRouter).toContain("미래의 해제 예정일을 입력해 주세요.");
  });
});
