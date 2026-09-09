import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./PushPermissionPrompt.tsx", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

describe("PushPermissionPrompt", () => {
  it("installs a denied Notification shim before cached bundles run", () => {
    expect(indexSource).toContain('typeof window.Notification === "undefined"');
    expect(indexSource).toContain('UnsupportedNotification.permission = "denied"');
    expect(indexSource).toContain("window.Notification = UnsupportedNotification");
  });
  it("requests notification permission from a supported Google-login browser without requiring app installation", () => {
    expect(source).toContain('user?.loginMethod === "google"');
    expect(source).toContain('"serviceWorker" in navigator');
    expect(source).toContain('const hasNotificationApi = isBrowser && "Notification" in window;');
    expect(source).toContain('window.Notification.permission');
    expect(source).not.toContain("const [installed, setInstalled]");
    expect(source).toContain("Notification.requestPermission()");
    expect(source).toContain("알림 허용");
  });

  it("saves the browser subscription through the protected web push API", () => {
    expect(source).toContain("trpc.webPush.subscribe.useMutation");
    expect(source).toContain("registration.pushManager.subscribe");
    expect(source).toContain("목표 가격 도달 알림을 받을까요?");
    expect(source).toContain("trpc.webPush.status.useQuery");
    expect(source).toContain("푸시 알림 다시 연결");
    expect(source).toContain('navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })');
  });

  it("does not auto-subscribe and dismiss the reconnect prompt before the user presses the button", () => {
    expect(source).toContain('const [browserSubscriptionState, setBrowserSubscriptionState] = useState<"checking" | "missing" | "ready">("checking");');
    expect(source).toContain("navigator.serviceWorker.ready");
    expect(source).toContain("registration.pushManager.getSubscription()");
    expect(source).not.toContain("void saveSubscription(false)");
    expect(source).toContain('browserSubscriptionState === "missing"');
    expect(source).toContain("Boolean(subscriptionError)");
    expect(source).toContain("push service not available");
    expect(source).toContain("현재 브라우저의 푸시 서비스를 사용할 수 없습니다.");
  });
});
