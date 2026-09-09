import crypto from "node:crypto";
import type { Product } from "../drizzle/schema";
import { decodeCandidateCsvBytes } from "../shared/candidateCsvEncoding";
import { userConfirmedPriceCsvTemplate } from "./userConfirmedPriceCsv";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3";
const SNAPSHOT_NAME = "gasyn-products-latest.json";
const CANDIDATE_CSV_NAME = "gasyn-candidates.csv";
const CANDIDATE_CSV_TEMPLATE = "상품명,옵션명,원본 URL,메모\n";
const USER_PRICE_CSV_NAME = "gasyn-user-prices.csv";

function getCipherKey(secret = process.env.JWT_SECRET ?? "") {
  if (!secret) throw new Error("JWT_SECRET is required to protect Google Drive refresh tokens");
  return crypto.createHash("sha256").update(`gasyn-google-drive:${secret}`).digest();
}

export function encryptGoogleDriveRefreshToken(refreshToken: string, secret?: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getCipherKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(part => part.toString("base64url")).join(".");
}

export function decryptGoogleDriveRefreshToken(ciphertext: string, secret?: string) {
  const [ivPart, tagPart, encryptedPart] = ciphertext.split(".");
  if (!ivPart || !tagPart || !encryptedPart) throw new Error("Stored Google Drive token format is invalid");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getCipherKey(secret), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedPart, "base64url")), decipher.final()]).toString("utf8");
}

function getGoogleConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured");
  return { clientId, clientSecret };
}

export function getGoogleDriveRedirectUri(baseUrl: string) {
  return `${baseUrl}/api/integrations/google-drive/callback`;
}

export function buildGoogleDriveAuthorizationUrl(input: { clientId: string; redirectUri: string; state: string; loginHint?: string | null }) {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: input.state,
  });
  if (input.loginHint) params.set("login_hint", input.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleDriveAuthorizationCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = getGoogleConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json()) as { refresh_token?: string; error_description?: string };
  if (!response.ok || !data.refresh_token) throw new Error(data.error_description ?? "Google Drive refresh token was not issued");
  return data.refresh_token;
}

async function getAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getGoogleConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description ?? "Google Drive access token refresh failed");
  return data.access_token;
}

function snapshotPayload(products: Product[]) {
  return JSON.stringify({
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
  }, null, 2);
}

function buildUploadUrl(path: string, uploadType: "media" | "multipart") {
  return `${DRIVE_UPLOAD_URL}${path}?${new URLSearchParams({ uploadType, supportsAllDrives: "true" }).toString()}`;
}

export async function syncProductsToPersonalGoogleDrive(input: { refreshTokenCiphertext: string; folderId: string; snapshotFileId: string | null; products: Product[] }) {
  const accessToken = await getAccessToken(decryptGoogleDriveRefreshToken(input.refreshTokenCiphertext));
  const snapshot = snapshotPayload(input.products);
  if (input.snapshotFileId) {
    const response = await fetch(buildUploadUrl(`/files/${input.snapshotFileId}`, "media"), {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: snapshot,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Google Drive snapshot update failed with HTTP ${response.status}`);
    return { fileId: input.snapshotFileId, action: "updated" as const };
  }

  const boundary = `gasyn_${crypto.randomBytes(12).toString("hex")}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify({ name: SNAPSHOT_NAME, mimeType: "application/json", parents: input.folderId === "root" ? undefined : [input.folderId] }),
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    snapshot,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const response = await fetch(buildUploadUrl("/files", "multipart"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await response.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
  if (!response.ok || !data?.id) throw new Error(`Google Drive snapshot creation failed with HTTP ${response.status}${data?.error?.message ? `: ${data.error.message}` : ""}`);
  return { fileId: data.id, action: "created" as const };
}

async function createDriveTextFile(input: { accessToken: string; folderId: string; name: string; content: string; mimeType: string }) {
  const boundary = `gasyn_${crypto.randomBytes(12).toString("hex")}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify({ name: input.name, mimeType: input.mimeType, parents: input.folderId === "root" ? undefined : [input.folderId] }),
    `--${boundary}`,
    `Content-Type: ${input.mimeType}`,
    "",
    input.content,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const response = await fetch(buildUploadUrl("/files", "multipart"), {
    method: "POST",
    headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await response.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
  if (!response.ok || !data?.id) throw new Error(`Google Drive CSV creation failed with HTTP ${response.status}${data?.error?.message ? `: ${data.error.message}` : ""}`);
  return data.id;
}

export async function loadCandidateCsvFromPersonalGoogleDrive(input: { refreshTokenCiphertext: string; folderId: string; candidateCsvFileId: string | null }) {
  const accessToken = await getAccessToken(decryptGoogleDriveRefreshToken(input.refreshTokenCiphertext));
  let fileId = input.candidateCsvFileId;
  let action: "created" | "loaded" = "loaded";
  if (!fileId) {
    fileId = await createDriveTextFile({ accessToken, folderId: input.folderId, name: CANDIDATE_CSV_NAME, content: CANDIDATE_CSV_TEMPLATE, mimeType: "text/csv" });
    action = "created";
  }
  const response = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Google Drive CSV read failed with HTTP ${response.status}`);
  return { fileId, action, csvText: decodeCandidateCsvBytes(await response.arrayBuffer()) };
}

export async function loadUserConfirmedPriceCsvFromPersonalGoogleDrive(input: { refreshTokenCiphertext: string; folderId: string; userPriceCsvFileId: string | null }) {
  const accessToken = await getAccessToken(decryptGoogleDriveRefreshToken(input.refreshTokenCiphertext));
  let fileId = input.userPriceCsvFileId;
  let action: "created" | "loaded" = "loaded";
  if (!fileId) {
    fileId = await createDriveTextFile({ accessToken, folderId: input.folderId, name: USER_PRICE_CSV_NAME, content: userConfirmedPriceCsvTemplate, mimeType: "text/csv" });
    action = "created";
  }
  const response = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Google Drive CSV read failed with HTTP ${response.status}`);
  return { fileId, action, csvText: decodeCandidateCsvBytes(await response.arrayBuffer()) };
}
