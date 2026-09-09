import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerGoogleOAuthRoutes } from "../googleAuth";
import { registerKakaoOAuthRoutes } from "../kakaoAuth";
import { registerPriceAlertRoutes } from "../priceAlertRoutes";
import { registerScheduledJobRoutes } from "../scheduledJobs";
import { registerCollectionRoutes } from "../collectionRoutes";
import { registerWebPushConfigRoutes } from "../webPushConfigRoutes";
import { registerExternalPriceRefreshRoute, registerExternalFavoritesRefreshRoute } from "../externalPriceRefresh";
import { buildProductSitemapXml, buildSitemapIndexXml, buildStaticSitemapXml } from "../seoSitemap";
import { registerImageProxy } from "../imageProxy";
import { registerLighthouseAuditRoute } from "../lighthouseAudit";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use((_req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' https://analytics.gasin.shop; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-src https://coupa.ng https://ads-partners.coupang.com https://partners.coupangcdn.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    next();
  });
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerImageProxy(app);
  registerOAuthRoutes(app);
  registerGoogleOAuthRoutes(app);
  registerKakaoOAuthRoutes(app);
  registerPriceAlertRoutes(app);
  registerScheduledJobRoutes(app);
  registerExternalPriceRefreshRoute(app);
  registerExternalFavoritesRefreshRoute(app);
  registerLighthouseAuditRoute(app);
  registerCollectionRoutes(app);
  registerWebPushConfigRoutes(app);
  app.get("/sitemap.xml", async (_req, res) => {
    res.type("application/xml").set("Cache-Control", "public, max-age=300").send(buildSitemapIndexXml());
  });
  app.get("/sitemap-static.xml", (_req, res) => {
    res.type("application/xml").set("Cache-Control", "public, max-age=300").send(buildStaticSitemapXml());
  });
  app.get("/sitemap-products-1.xml", async (_req, res, next) => {
    try {
      res.type("application/xml").set("Cache-Control", "public, max-age=300").send(await buildProductSitemapXml());
    } catch (error) {
      next(error);
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
