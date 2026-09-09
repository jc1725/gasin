import { afterEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "@shared/const";
import type { Request } from "express";
import type { User } from "../drizzle/schema";
import * as db from "./db";
import { sdk } from "./_core/sdk";

const now = new Date("2026-08-25T10:00:00.000Z");
const endsAt = new Date("2026-08-28T10:00:00.000Z");

afterEach(() => vi.restoreAllMocks());

describe("suspended session notice", () => {
  it("returns the suspension reason and expected end date for the signed-in suspended member", async () => {
    vi.spyOn(db, "getUserByOpenId").mockResolvedValue({
      id: 99,
      openId: "suspended-member",
      name: "Suspended Member",
      email: "member@example.com",
      loginMethod: "google",
      role: "user",
      isSuspended: true,
      suspendedAt: now,
      suspensionEndsAt: endsAt,
      suspensionReason: "반복적인 서비스 방해",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    } satisfies User);
    const token = await sdk.createSessionToken("suspended-member", { name: "Suspended Member" });
    const request = { headers: { cookie: `${COOKIE_NAME}=${token}` } } as Request;

    await expect(sdk.getSuspensionStatus(request)).resolves.toEqual({
      isSuspended: true,
      reason: "반복적인 서비스 방해",
      suspendedAt: now,
      endsAt,
    });
  });

  it("does not look up a user when no session is attached", async () => {
    const lookup = vi.spyOn(db, "getUserByOpenId");
    await expect(sdk.getSuspensionStatus({ headers: {} } as Request)).resolves.toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });
});
