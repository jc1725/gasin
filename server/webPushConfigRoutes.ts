import type { Express } from "express";
import { getWebPushConfiguration } from "./webPushConfig";

/** Browser subscription bootstrap: only the public VAPID key is exposed. */
export function registerWebPushConfigRoutes(app: Express) {
  app.get("/api/push/config", (_req, res) => {
    try {
      const { publicKey } = getWebPushConfiguration();
      res.setHeader("Cache-Control", "no-store");
      res.json({ publicKey });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown VAPID configuration error";
      console.error("[Web Push] VAPID configuration unavailable", error);
      res.status(503).json({ error: "Web Push is temporarily unavailable", detail });
    }
  });
}
