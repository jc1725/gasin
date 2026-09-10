import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getSessionCookieOptions } from "./cookies";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;

    // A session cookie that fails to verify (e.g. signed under a since-rotated
    // JWT_SECRET, or otherwise corrupted) is not self-correcting: the browser
    // keeps resending it on every request for up to a year (the cookie's
    // maxAge), which re-triggers "[Auth] Session verification failed" on every
    // single request from that browser. Clear it once so the browser stops
    // sending it — a request with no cookie at all is left untouched.
    const hasSessionCookie = Boolean(parseCookieHeader(opts.req.headers.cookie ?? "")[COOKIE_NAME]);
    if (hasSessionCookie) {
      opts.res.clearCookie(COOKIE_NAME, getSessionCookieOptions(opts.req));
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
