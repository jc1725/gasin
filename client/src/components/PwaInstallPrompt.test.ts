import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./PwaInstallPrompt.tsx", import.meta.url), "utf8");

describe("PwaInstallPrompt", () => {
  it("waits for an installable, non-standalone app before showing the install notice", () => {
    expect(source).toContain('window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)');
    expect(source).toContain("if (installed || (!persistent && dismissed) || (!deferredPrompt && !isIos && !persistent)) return null");
    expect(source).toContain("appinstalled");
    expect(source).toContain('const INSTALLED_KEY = "gasyn-pwa-installed"');
    expect(source).toContain("function isInstallMarked()");
    expect(source).toContain("function markInstalled()");
    expect(source).toContain("const installedNow = standalone || installedMarker");
    expect(source).toContain("window.__gasynBeforeInstallPrompt");
  });

  it("supports installation and a seven-day dismissal choice", () => {
    expect(source).toContain("홈 화면에 설치");
    expect(source).toContain('window.localStorage.setItem(INSTALLED_KEY, "1")');
    expect(source).toContain("나중에");
    expect(source).toContain("DISMISS_DURATION_MS");
  });

  it("supports a persistent inline shortcut button for the home page", () => {
    expect(source).toContain("persistent?: boolean; inline?: boolean");
    expect(source).toContain("if (inline) return <section aria-label=\"가신 바로가기 설치\"");
    expect(source).toContain("브라우저 메뉴에서");
    expect(source).toContain("Safari 공유 버튼");
    expect(source).toContain("isInAppBrowser");
    expect(source).toContain("외부 브라우저로 열기");
    expect(source).toContain("intent://");
    expect(source).toContain('window.open(currentUrl, "_blank", "noopener,noreferrer")');
    expect(source).toContain("setManualGuideOpen(true);");
    expect(source).toContain("catch {");
    expect(source).toContain("설치 창이 열리지 않으면");
  });
});
