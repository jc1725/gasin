import { describe, expect, it } from "vitest";
import { createGmailTransport } from "./gmailSender";

describe("Gmail SMTP credentials", () => {
  it("authenticates with the configured Gmail app password", async () => {
    const user = process.env.GMAIL_SMTP_USERNAME?.trim();
    const pass = process.env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s/g, "");
    expect(user).toMatch(/^[^\s@]+@gmail\.com$/i);
    expect(pass).toMatch(/^.{16}$/);

    const transport = createGmailTransport();
    await expect(transport.verify()).resolves.toBe(true);
  }, 25_000);
});
