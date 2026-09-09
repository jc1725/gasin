import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import { registerExternalFavoritesRefreshRoute } from "./externalPriceRefresh";

let server: Server;
let baseUrl = "";
const enqueue = vi.fn();

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerExternalFavoritesRefreshRoute(app, enqueue);
  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      const address = server.address();
      if (address && typeof address !== "string") baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => new Promise<void>(resolve => server.close(() => resolve())));

describe("external favorites refresh API", () => {
  it("accepts the configured external schedule secret and returns the queue result", async () => {
    expect(ENV.gasynExternalScheduleToken).not.toBe("");
    enqueue.mockResolvedValueOnce({ favoriteCount: 5, queuedCount: 4, skippedCount: 1 });
    const response = await fetch(`${baseUrl}/api/external/favorites-refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ENV.gasynExternalScheduleToken}` },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, favoriteCount: 5, queuedCount: 4, skippedCount: 1 });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("skips an overlapping run while a previous request is still in flight", async () => {
    enqueue.mockClear();
    let resolveEnqueue!: (value: unknown) => void;
    enqueue.mockReturnValueOnce(new Promise(resolve => { resolveEnqueue = resolve; }));
    const headers = { Authorization: `Bearer ${ENV.gasynExternalScheduleToken}` };
    const firstPromise = fetch(`${baseUrl}/api/external/favorites-refresh`, { method: "POST", headers });
    await new Promise(resolve => setTimeout(resolve, 50));
    const second = await fetch(`${baseUrl}/api/external/favorites-refresh`, { method: "POST", headers });
    expect(second.status).toBe(202);
    await expect(second.json()).resolves.toEqual({ ok: true, accepted: true, skipped: "already-running" });
    resolveEnqueue({ favoriteCount: 0, queuedCount: 0, skippedCount: 0 });
    const first = await firstPromise;
    expect(first.status).toBe(200);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("rejects missing or incorrect schedule tokens", async () => {
    await expect(fetch(`${baseUrl}/api/external/favorites-refresh`, { method: "POST" }).then(response => response.status)).resolves.toBe(401);
    await expect(fetch(`${baseUrl}/api/external/favorites-refresh`, { method: "POST", headers: { Authorization: "Bearer incorrect" } }).then(response => response.status)).resolves.toBe(401);
  });

  it("reports a failure without leaving the run flag stuck", async () => {
    enqueue.mockClear();
    enqueue.mockRejectedValueOnce(new Error("db unavailable"));
    const headers = { Authorization: `Bearer ${ENV.gasynExternalScheduleToken}` };
    const failed = await fetch(`${baseUrl}/api/external/favorites-refresh`, { method: "POST", headers });
    expect(failed.status).toBe(500);
    enqueue.mockResolvedValueOnce({ favoriteCount: 1, queuedCount: 1, skippedCount: 0 });
    const recovered = await fetch(`${baseUrl}/api/external/favorites-refresh`, { method: "POST", headers });
    expect(recovered.status).toBe(200);
  });
});
