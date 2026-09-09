import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");

describe("PWA install event capture", () => {
  it("captures beforeinstallprompt before React components mount", () => {
    expect(source).toContain('window.addEventListener("beforeinstallprompt", event =>');
    expect(source).toContain("window.__gasynBeforeInstallPrompt = event;");
    expect(source).toContain("event.preventDefault();");
  });
});

