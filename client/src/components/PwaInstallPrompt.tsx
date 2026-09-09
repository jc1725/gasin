import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

const DISMISS_UNTIL_KEY = "gasyn-pwa-install-dismissed-until";
const INSTALLED_KEY = "gasyn-pwa-installed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isInstallMarked() {
  try {
    return window.localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

function markInstalled() {
  try { window.localStorage.setItem(INSTALLED_KEY, "1"); } catch { /* local storage unavailable */ }
}

function isDismissed() {
  try {
    return Number(window.localStorage.getItem(DISMISS_UNTIL_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

type PwaInstallPromptProps = { persistent?: boolean; inline?: boolean };

export default function PwaInstallPrompt({ persistent = false, inline = false }: PwaInstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(true);
  const [dismissed, setDismissed] = useState(true);
  const [manualGuideOpen, setManualGuideOpen] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);

  useEffect(() => {
    const standalone = isStandalone();
    const installedMarker = isInstallMarked();
    const installedNow = standalone || installedMarker;
    setInstalled(installedNow);
    setDismissed(isDismissed());
    const userAgent = navigator.userAgent;
    setIsIos(/iphone|ipad|ipod/i.test(userAgent) && !standalone);
    setIsInAppBrowser(/KAKAOTALK|Line\/|FBAN|FBAV|Instagram/i.test(userAgent));

    const storedPrompt = window.__gasynBeforeInstallPrompt;
    if (storedPrompt && !installedNow && !isDismissed()) {
      setDeferredPrompt(storedPrompt as BeforeInstallPromptEvent);
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      window.__gasynBeforeInstallPrompt = event;
      if (!isStandalone() && !isInstallMarked() && !isDismissed()) setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      markInstalled();
      setInstalled(true);
      setDeferredPrompt(null);
      window.__gasynBeforeInstallPrompt = undefined;
      setManualGuideOpen(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try { window.localStorage.setItem(DISMISS_UNTIL_KEY, String(Date.now() + DISMISS_DURATION_MS)); } catch { /* local storage unavailable */ }
    setDismissed(true);
    setDeferredPrompt(null);
    window.__gasynBeforeInstallPrompt = undefined;
    setManualGuideOpen(false);
  };

  const openExternalBrowser = () => {
    const currentUrl = window.location.href;
    setManualGuideOpen(true);
    if (/android/i.test(navigator.userAgent)) {
      const target = new URL(currentUrl);
      window.location.href = `intent://${target.host}${target.pathname}${target.search}${target.hash}#Intent;scheme=https;package=com.android.chrome;end`;
      return;
    }
    const opened = window.open(currentUrl, "_blank", "noopener,noreferrer");
    if (!opened) setManualGuideOpen(true);
  };

  const install = async () => {
    if (isInAppBrowser) {
      openExternalBrowser();
      return;
    }
    if (!deferredPrompt) {
      setManualGuideOpen(true);
      return;
    }
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === "accepted") {
        markInstalled();
        setInstalled(true);
      }
      else setManualGuideOpen(true);
    } catch {
      setDeferredPrompt(null);
      setManualGuideOpen(true);
    }
  };

  if (installed || (!persistent && dismissed) || (!deferredPrompt && !isIos && !persistent)) return null;

  const guideText = isInAppBrowser
    ? <>외부 브라우저로 이동을 시도했습니다. 이동하지 않거나 설치 창이 열리지 않으면 우측 상단 메뉴에서 <strong>외부 브라우저로 열기</strong>를 선택한 뒤 설치해 주세요.</>
    : isIos
      ? <><span className="inline-flex items-center gap-1 font-bold"><Share className="size-3.5" />Safari 공유 버튼</span>을 누른 뒤 <strong>‘홈 화면에 추가’</strong>를 선택해 주세요.</>
      : <>브라우저 메뉴에서 <strong>‘홈 화면에 추가’</strong> 또는 <strong>‘앱 설치’</strong>를 선택해 주세요.</>;

  const content = <>
    <div className="flex items-start gap-3">
      <img src="/gasyn-icon.png" alt="가신" className="size-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1"><p className="text-sm font-extrabold text-[#1d3b25] dark:text-white">가신을 홈 화면에 설치하세요</p><p className="mt-1 text-[11px] leading-4 text-[#607765] dark:text-[#b6d9bd]">앱처럼 빠르게 열고 가격 변화를 확인할 수 있습니다.</p></div>
      {!inline ? <button type="button" onClick={dismiss} className="grid size-8 shrink-0 place-items-center rounded-full text-[#718071] transition hover:bg-[#f1f6f1]" aria-label="설치 안내 닫기"><X className="size-4" /></button> : null}
    </div>
    {manualGuideOpen ? <div className="mt-3 rounded-xl bg-[#f4fbf5] p-3 text-[11px] leading-5 text-[#42624b]">{guideText}</div> : null}
    <div className="mt-3 flex gap-2">{!inline ? <button type="button" onClick={dismiss} className="min-h-10 flex-1 rounded-xl border border-[#d6e3d7] px-3 text-xs font-bold text-[#607765]">나중에</button> : null}<button type="button" onClick={() => void install()} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#176b3a] px-3 text-xs font-bold text-white transition hover:bg-[#125a30] active:scale-95"><Download className="size-3.5" />{isInAppBrowser ? "외부 브라우저로 열기" : "홈 화면에 설치"}</button></div>
  </>;

  if (inline) return <section aria-label="가신 바로가기 설치" className="mt-5 rounded-3xl border border-[#cfe3d2] bg-[#f4fbf5] p-4 shadow-sm dark:border-[#31513c] dark:bg-[#183024]">{content}</section>;
  return <aside role="dialog" aria-label="가신 홈 화면 설치 안내" className="fixed inset-x-4 bottom-23 z-40 mx-auto max-w-md rounded-2xl border border-[#cfe3d2] bg-white p-3 shadow-[0_16px_42px_rgba(23,107,58,.22)] dark:border-[#31513c] dark:bg-[#183024]">
    {content}
  </aside>;
}
