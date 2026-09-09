import type { Express } from "express";
import sharp from "sharp";

const allowedHosts = ["ads-partners.coupang.com", "coupangcdn.com", "thumbnail.coupangcdn.com"];

function isAllowedImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export function registerImageProxy(app: Express) {
  app.get("/api/image-proxy", async (req, res) => {
    const source = typeof req.query.url === "string" ? req.query.url : "";
    const width = Math.max(48, Math.min(640, Number(req.query.w) || 312));
    if (!isAllowedImageUrl(source)) return res.status(400).json({ error: "Unsupported image source" });
    try {
      const response = await fetch(source, { headers: { Accept: "image/avif,image/webp,image/*" }, signal: AbortSignal.timeout(8_000) });
      if (!response.ok) return res.status(502).end();
      const input = Buffer.from(await response.arrayBuffer());
      const acceptsAvif = /image\/avif/i.test(req.get("accept") ?? "");
      const transformer = sharp(input).resize(width, width, { fit: "inside", withoutEnlargement: true });
      const output = acceptsAvif ? await transformer.avif({ quality: 58, effort: 4 }).toBuffer() : await transformer.webp({ quality: 72, effort: 4 }).toBuffer();
      res.type(acceptsAvif ? "image/avif" : "image/webp").set("Cache-Control", "public, max-age=604800, immutable").set("Vary", "Accept").send(output);
    } catch (error) {
      console.warn("[ImageProxy] failed", error instanceof Error ? error.message : error);
      res.status(502).end();
    }
  });
}
