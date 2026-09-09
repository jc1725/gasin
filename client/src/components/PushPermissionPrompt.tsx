import { useCallback, useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const DISMISS_UNTIL_KEY = "gasyn-push-permission-dismissed-until";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function isDismissed() {
  try { return Number(window.localStorage.getItem(DISMISS_UNTIL_KEY) ?? 0) > Date.now(); } catch { return false; }
}

function decodeVapidPublicKey(value: string) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const binary = window.atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function getPushErrorMessage(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  if (/push service not available|registration failed/i.test(rawMessage)) {
    return "현재 브라우저의 푸시 서비스를 사용할 수 없습니다. Android Chrome 또는 설치한 가신 앱에서 다시 시도해 주세요.";
  }
  return rawMessage || "웹 푸시 알림 설정에 실패했습니다.";
}

export default function PushPermissionPrompt() {
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const [dismissed, setDismissed] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [browserSubscriptionState, setBrowserSubscriptionState] = useState<"checking" | "missing" | "ready">("checking");
  const isGoogleUser = user?.loginMethod === "google";
  const isBrowser = typeof window !== "undefined";
  const hasNotificationApi = isBrowser && "Notification" in window;
  const canUsePush = isBrowser && isGoogleUser && hasNotificationApi && "serviceWorker" in navigator && "PushManager" in window;
  const { data: config } = trpc.webPush.config.useQuery(undefined, { enabled: canUsePush });
  const { data: pushStatus } = trpc.webPush.status.useQuery(undefined, { enabled: canUsePush });
  const subscribeMutation = trpc.webPush.subscribe.useMutation();

  const saveSubscription = useCallback(async (showFeedback: boolean) => {
    if (!config?.publicKey) throw new Error("웹 푸시 설정을 불러오지 못했습니다.");
    const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
    await registration.update().catch(() => undefined);
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidPublicKey(config.publicKey) });
    const json = subscription.toJSON();
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!json.endpoint || !p256dh || !auth) throw new Error("브라우저 푸시 구독 정보를 읽을 수 없습니다.");
    await subscribeMutation.mutateAsync({ endpoint: json.endpoint, p256dh, auth });
    setBrowserSubscriptionState("ready");
    setSubscriptionError(null);
    await utils.webPush.status.invalidate();
    if (showFeedback) toast.success("목표 가격 도달 웹 푸시 알림을 켰어요.");
  }, [config?.publicKey, subscribeMutation, utils.webPush.status]);

  useEffect(() => {
    setDismissed(isDismissed());
  }, []);

  useEffect(() => {
    if (!canUsePush || !hasNotificationApi || window.Notification.permission !== "granted") {
      setBrowserSubscriptionState("checking");
      return;
    }
    let active = true;
    void navigator.serviceWorker.ready
      .then(registration => registration.pushManager.getSubscription())
      .then(subscription => {
        if (active) setBrowserSubscriptionState(subscription ? "ready" : "missing");
      })
      .catch(error => {
        if (!active) return;
        const message = getPushErrorMessage(error);
        console.warn("[Web Push] Failed to inspect browser subscription", error);
        setBrowserSubscriptionState("missing");
        setSubscriptionError(message);
      });
    return () => { active = false; };
  }, [canUsePush]);

  const requestPermission = async () => {
    try {
      const permission = await window.Notification.requestPermission();
      if (permission !== "granted") {
        toast.message(permission === "denied" ? "브라우저 설정에서 알림을 허용하면 다시 받을 수 있어요." : "알림 권한을 허용하면 목표가 도달 소식을 받을 수 있어요.");
        return;
      }
      await saveSubscription(true);
    } catch (error) {
      const message = getPushErrorMessage(error);
      setSubscriptionError(message);
      toast.error(message);
    }
  };

  const dismiss = () => {
    try { window.localStorage.setItem(DISMISS_UNTIL_KEY, String(Date.now() + DISMISS_DURATION_MS)); } catch { /* local storage unavailable */ }
    setDismissed(true);
  };

  const notificationPermission = hasNotificationApi ? window.Notification.permission : "denied";
  const isPermissionPrompt = notificationPermission === "default";
  const needsResubscribe = notificationPermission === "granted" && (
    browserSubscriptionState === "missing"
    || Boolean(subscriptionError)
    || (browserSubscriptionState === "ready" && pushStatus?.subscribed === false)
  );
  const shouldShow = !loading && canUsePush && (isPermissionPrompt ? !dismissed : needsResubscribe);
  if (!shouldShow) return null;

  return <aside role="dialog" aria-label="목표 가격 알림 권한 안내" className="fixed inset-x-4 bottom-23 z-40 mx-auto max-w-md rounded-2xl border border-[#cfe3d2] bg-white p-3 shadow-[0_16px_42px_rgba(23,107,58,.22)] dark:border-[#31513c] dark:bg-[#183024]">
    <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#176b3a] text-white"><BellRing className="size-5" /></span><div className="min-w-0 flex-1"><p className="text-sm font-extrabold text-[#1d3b25] dark:text-white">{needsResubscribe ? "푸시 알림 다시 연결" : "목표 가격 도달 알림을 받을까요?"}</p><p className="mt-1 text-[11px] leading-4 text-[#607765] dark:text-[#b6d9bd]">설정한 목표가 이하가 되면 현재 휴대폰 브라우저 또는 설치한 가신 앱에 알려드려요.</p>{subscriptionError ? <p role="status" className="mt-1 text-[10px] leading-4 text-[#a44c45]">구독 등록 오류: {subscriptionError}</p> : null}</div>{isPermissionPrompt ? <button type="button" onClick={dismiss} className="grid size-8 shrink-0 place-items-center rounded-full text-[#718071] transition hover:bg-[#f1f6f1]" aria-label="알림 권한 안내 닫기"><X className="size-4" /></button> : null}</div>
    <div className="mt-3 flex gap-2">{isPermissionPrompt ? <button type="button" onClick={dismiss} className="min-h-10 flex-1 rounded-xl border border-[#d6e3d7] px-3 text-xs font-bold text-[#607765]">나중에</button> : null}<button type="button" onClick={() => void requestPermission()} disabled={subscribeMutation.isPending} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#176b3a] px-3 text-xs font-bold text-white transition hover:bg-[#125a30] active:scale-95 disabled:opacity-60"><BellRing className="size-3.5" />{subscribeMutation.isPending ? "연결 중" : needsResubscribe ? "푸시 다시 연결" : "알림 허용"}</button></div>
  </aside>;
}
