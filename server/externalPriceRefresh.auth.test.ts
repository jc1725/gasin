import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import { registerExternalPriceRefreshRoute } from "./externalPriceRefresh";

let server: Server;
let baseUrl = "";
const refresh = vi.fn();

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerExternalPriceRefreshRoute(app, refresh);
  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      const address = server.address();
      if (address && typeof address !== "string") baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => new Promise<void>(resolve => server.close(() => resolve())));

describe("external price refresh API", () => {
  it("accepts the configured external schedule secret and acknowledges before the job completes", async () => {
    expect(ENV.gasynExternalScheduleToken).not.toBe("");
    let resolveRefresh!: (value: unknown) => void;
    refresh.mockReturnValueOnce(new Promise(resolve => { resolveRefresh = resolve; }));
    const response = await fetch(`${baseUrl}/api/external/price-refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ENV.gasynExternalScheduleToken}` },
    });
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true, accepted: true, message: "가격 갱신 작업을 백그라운드에서 시작했습니다." });
    expect(refresh).toHaveBeenCalledTimes(1);
    resolveRefresh({ processedCount: 8, detail: "테스트 배치" });
    await new Promise(resolve => setImmediate(resolve));
  });

  it("skips an overlapping refresh while the previous background job is running", async () => {
    refresh.mockClear();
    let resolveRefresh!: (value: unknown) => void;
    refresh.mockReturnValueOnce(new Promise(resolve => { resolveRefresh = resolve; }));
    const headers = { Authorization: `Bearer ${ENV.gasynExternalScheduleToken}` };
    const first = await fetch(`${baseUrl}/api/external/price-refresh`, { method: "POST", headers });
    const second = await fetch(`${baseUrl}/api/external/price-refresh`, { method: "POST", headers });
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    await expect(second.json()).resolves.toEqual({ ok: true, accepted: true, skipped: "already-running" });
    expect(refresh).toHaveBeenCalledTimes(1);
    resolveRefresh({ processedCount: 0 });
    await new Promise(resolve => setImmediate(resolve));
  });

  it("rejects missing or incorrect schedule tokens", async () => {
    await expect(fetch(`${baseUrl}/api/external/price-refresh`, { method: "POST" }).then(response => response.status)).resolves.toBe(401);
    await expect(fetch(`${baseUrl}/api/external/price-refresh`, { method: "POST", headers: { Authorization: "Bearer incorrect" } }).then(response => response.status)).resolves.toBe(401);
  });
});
