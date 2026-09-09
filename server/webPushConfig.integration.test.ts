import express from "express";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerWebPushConfigRoutes } from "./webPushConfigRoutes";

const app = express();
registerWebPushConfigRoutes(app);
const server = app.listen(0, "127.0.0.1");
let port = 0;

beforeAll(async () => {
  if (!server.listening) await new Promise<void>(resolve => server.once("listening", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

describe("web push configuration endpoint", () => {
  it("validates the configured VAPID credentials and exposes only the public key", async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/push/config`);
    const body = await response.json() as { publicKey?: string; privateKey?: string };
    expect(response.status).toBe(200);
    expect(body.publicKey).toBe(process.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY);
    expect(body.privateKey).toBeUndefined();
  });
});
