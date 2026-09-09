import { Flame, Gem, Heart, Home, LogIn, LogOut, Moon, Search, ShieldCheck, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminUser } from "@shared/const";
import { useTheme } from "@/contexts/ThemeContext";
import { startLogin } from "@/const";
import PwaInstallPrompt from "./PwaInstallPrompt";
import PushPermissionPrompt from "./PushPermissionPrompt";
import SuspensionNotice from "./SuspensionNotice";
import SeoHead from "./SeoHead";

const tabs = [
  { href: "/", label: "홈", Icon: Home },
  { href: "/goldbox", label: "골드박스", Icon: Gem },
  { href: "/hot-deals", label: "특가", Icon: Flame },
  { href: "/favorites", label: "찜한상품", Icon: Heart },
  { href: "/search", label: "검색", Icon: Search },
] as const;

export default function GasynAppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, loading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isAdmin = isAdminUser(user);
  const visibleTabs = isAdmin ? [...tabs, { href: "/admin", label: "관리자", Icon: ShieldCheck }] : tabs;

  return (
    <div className="min-h-screen bg-[#f6f8f4] text-[#102016]">
      <SeoHead path={location} />
      <header className="sticky top-0 z-40 border-b border-[#dbe7da]/85 bg-[#f6f8f4]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-15 max-w-2xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2" aria-label="가신 홈으로 이동">
            <img src="/manus-storage/gasyn-text-shortcut-icon-preview_1bf92205.png" alt="가신" className="size-8 rounded-xl shadow-[0_6px_18px_rgba(23,107,58,.23)]" />
            <div className="leading-none"><strong className="text-lg tracking-[-0.07em]">가신</strong><span className="ml-1.5 text-[10px] font-semibold tracking-tight text-[#608068]">가격의 신호</span></div>
          </Link>
          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-1.5">
                <span className="hidden max-w-28 truncate text-xs font-semibold text-[#42624b] sm:block dark:text-[#b6d9bd]" title={user.email ?? user.name ?? "로그인 계정"}>{user.name ?? user.email ?? "로그인 계정"}</span>
                <button type="button" onClick={() => void logout()} disabled={loading} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-bold text-[#176b3a] shadow-sm ring-1 ring-[#e2ebe1] transition hover:bg-[#eaf6ec] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#183024] dark:text-[#a9e8bd] dark:ring-[#31513c] dark:hover:bg-[#244632]" aria-label="로그아웃" title="로그아웃"><LogOut className="size-3.5" /><span>로그아웃</span></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5"><button type="button" onClick={startLogin} disabled={loading} className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#176b3a] px-3 text-xs font-bold text-white shadow-[0_4px_12px_rgba(23,107,58,.2)] transition hover:bg-[#125a30] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60" aria-label="Google 로그인" title="Google 로그인"><LogIn className="size-3.5" /><span>Google</span></button><a href="/api/auth/kakao" className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full bg-[#fee500] px-3 text-xs font-extrabold text-[#191600] shadow-sm transition hover:bg-[#f3d800] active:scale-95" aria-label="카카오 로그인" title="카카오 로그인">카카오</a></div>
            )}
            <Link href="/search" className="grid size-9 place-items-center rounded-full bg-white text-[#176b3a] shadow-sm ring-1 ring-[#e2ebe1] dark:bg-[#183024] dark:text-[#a9e8bd] dark:ring-[#31513c]" aria-label="상품 검색"><Search className="size-4" /></Link>
            <button type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"} aria-pressed={theme === "dark"} className="grid size-9 place-items-center rounded-full bg-white text-[#176b3a] shadow-sm ring-1 ring-[#e2ebe1] transition hover:bg-[#eaf6ec] active:scale-95 dark:bg-[#183024] dark:text-[#f4d77e] dark:ring-[#31513c] dark:hover:bg-[#244632]">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto min-h-[calc(100vh-60px)] max-w-2xl px-5 pb-38 pt-5">{children}</main>
      <PwaInstallPrompt />
      <PushPermissionPrompt />
      <SuspensionNotice />
      <footer className="mx-auto max-w-2xl px-6 pb-27 text-center text-[11px] leading-relaxed text-[#778679]">{location.startsWith("/hot-deals") ? "특가 상품의 구매는 해당 스마트스토어에서 진행되며, 상품 정보와 판매 조건은 판매 페이지 기준입니다." : "가신 링크 제품 구매시 쿠팡파트너스 활동의 일환으로 일정액의 수수료를 제공받습니다."}</footer>
      <nav aria-label="주요 메뉴" className="fixed inset-x-0 bottom-0 z-50 border-t border-[#dbe7da] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className={`mx-auto grid max-w-2xl px-3 py-2 ${isAdmin ? "grid-cols-6" : "grid-cols-5"}`}>
          {visibleTabs.map(({ href, label, Icon }) => { const active = href === "/" ? location === "/" : location.startsWith(href); return <Link key={href} href={href} className={`flex min-h-13 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition ${active ? "bg-[#e5f2e7] text-[#176b3a]" : "text-[#7a877c] hover:text-[#176b3a]"}`}><Icon className={`size-4 ${active ? "stroke-[2.5]" : "stroke-2"}`} />{label}</Link>; })}
        </div>
      </nav>
    </div>
  );
}
