import crypto from "node:crypto";
import type { Product } from "../drizzle/schema";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3";
const SNAPSHOT_NAME = "gasyn-products-latest.json";

function requiredEnv(name: "GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL" | "GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY" | "GOOGLE_DRIVE_FOLDER_ID") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

export function buildGoogleDriveUrl(baseUrl: string, path: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ supportsAllDrives: "true", ...params });
  return `${baseUrl}${path}?${query.toString()}`;
}

async function readGoogleError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return payload?.error?.message ? `: ${payload.error.message}` : "";
}

export function normalizeGoogleDrivePrivateKey(rawValue: string) {
  let value = rawValue.trim();
  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as { private_key?: unknown };
      if (typeof parsed.private_key === "string") value = parsed.private_key;
    } catch {
      // Continue with the raw value so the explicit PEM validation below can explain the issue.
    }
  } else if (value.startsWith('"') && value.endsWith('"')) {
    try {
      value = JSON.parse(value) as string;
    } catch {
      value = value.slice(1, -1);
    }
  }
  const normalized = value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n?/g, "\n").trim();
  if (!normalized.includes("-----BEGIN PRIVATE KEY-----") || !normalized.includes("-----END PRIVATE KEY-----")) {
    throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY must contain a complete PEM private key");
  }
  return normalized;
}

async function getDriveAccessToken() {
  const email = requiredEnv("GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = normalizeGoogleDrivePrivateKey(requiredEnv("GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY"));
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(privateKey, "base64url");
  const assertion = `${header}.${payload}.${signature}`;

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description ?? "Google Drive authentication failed");
  return data.access_token;
}

async function findSnapshotId(accessToken: string, folderId: string) {
  const query = new URLSearchParams({
    q: `name = '${SNAPSHOT_NAME}' and '${folderId}' in parents and trashed = false`,
    fields: "files(id)",
    pageSize: "1",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const response = await fetch(`${DRIVE_API_URL}/files?${query.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Google Drive lookup failed with HTTP ${response.status}${await readGoogleError(response)}`);
  const data = (await response.json()) as { files?: Array<{ id: string }> };
  return data.files?.[0]?.id;
}

export async function validateGoogleDriveConnection() {
  const accessToken = await getDriveAccessToken();
  const folderId = requiredEnv("GOOGLE_DRIVE_FOLDER_ID");
  await findSnapshotId(accessToken, folderId);
  return true;
}

export async function syncProductsToGoogleDrive(products: Product[]) {
  const accessToken = await getDriveAccessToken();
  const folderId = requiredEnv("GOOGLE_DRIVE_FOLDER_ID");
  const snapshot = JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      productCount: products.length,
      products: products.map(product => ({
        externalProductId: product.externalProductId,
        name: product.name,
        categoryName: product.categoryName,
        currentPrice: product.currentPrice,
        lowestPrice: product.lowestPrice,
        affiliateUrl: product.affiliateUrl,
        imageUrl: product.imageUrl,
        source: product.source,
        lastSeenAt: product.lastSeenAt,
      })),
    },
    null,
    2
  );
  const existingId = await findSnapshotId(accessToken, folderId);

  if (existingId) {
    const response = await fetch(buildGoogleDriveUrl(DRIVE_UPLOAD_URL, `/files/${existingId}`, { uploadType: "media" }), {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: snapshot,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Google Drive snapshot update failed with HTTP ${response.status}${await readGoogleError(response)}`);
    return { fileId: existingId, action: "updated" as const };
  }

  const boundary = `gasyn_${crypto.randomBytes(12).toString("hex")}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify({ name: SNAPSHOT_NAME, mimeType: "application/json", parents: [folderId] }),
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    snapshot,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const response = await fetch(buildGoogleDriveUrl(DRIVE_UPLOAD_URL, "/files", { uploadType: "multipart" }), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await response.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
  if (!response.ok || !data?.id) throw new Error(`Google Drive snapshot creation failed with HTTP ${response.status}${data?.error?.message ? `: ${data.error.message}` : ""}`);
  return { fileId: data.id, action: "created" as const };
}
