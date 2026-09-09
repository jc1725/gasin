import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Ban, CalendarDays, Crown, LogIn, RotateCcw, Search, ShieldCheck, ShieldOff, UserCog, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminEmail, isAdminUser } from "@shared/const";
import { trpc } from "@/lib/trpc";

const formatDate = (value: Date | string) => new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}).format(new Date(value));

const toDateTimeLocalValue = (value: Date | string) => {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

function loginLabel(loginMethod: string | null) {
  if (loginMethod === "google") return "Google";
  if (loginMethod === "kakao") return "카카오";
  return loginMethod || "기타";
}

export default function AdminMembers() {
  const { user, loading } = useAuth();
  const isAdmin = isAdminUser(user);
  const isOwner = isAdminEmail(user?.email);
  const utils = trpc.useUtils();
  const members = trpc.members.list.useQuery(undefined, { enabled: isAdmin });
  const setRole = trpc.members.setRole.useMutation({ onError: error => toast.error(error.message) });
  const setSuspension = trpc.members.setSuspension.useMutation({ onError: error => toast.error(error.message) });
  const [query, setQuery] = useState("");
  const [suspensionReasons, setSuspensionReasons] = useState<Record<number, string>>({});
  const [suspensionEndsAt, setSuspensionEndsAt] = useState<Record<number, string>>({});

  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return members.data ?? [];
    return (members.data ?? []).filter(member => [member.name, member.email, member.loginMethod, member.suspensionReason].some(value => value?.toLowerCase().includes(normalized)));
  }, [members.data, query]);
  const adminCount = (members.data ?? []).filter(member => member.role === "admin" || isAdminEmail(member.email)).length;
  const suspendedCount = (members.data ?? []).filter(member => member.isSuspended).length;

  const changeRole = (member: NonNullable<typeof members.data>[number]) => {
    if (!isOwner) return;
    if (isAdminEmail(member.email)) return toast.error("지정 관리자의 권한은 변경할 수 없습니다.");
    if (member.loginMethod !== "google") return toast.error("관리자 권한은 Google 로그인 회원에게만 지정할 수 있습니다.");
    const role = member.role === "admin" ? "user" : "admin" as const;
    const action = role === "admin" ? "관리자로 지정" : "일반 회원으로 변경";
    if (!window.confirm(`${member.name ?? member.email ?? "이 회원"}을(를) ${action}할까요?`)) return;
    setRole.mutate({ memberId: member.id, role }, {
      onSuccess: async () => {
        await utils.members.list.invalidate();
        toast.success(role === "admin" ? "관리자 권한을 지정했습니다." : "관리자 권한을 해제했습니다.");
      },
    });
  };

  const changeSuspension = (member: NonNullable<typeof members.data>[number]) => {
    if (!isOwner) return;
    if (isAdminEmail(member.email)) return toast.error("지정 관리자는 이용정지할 수 없습니다.");
    if (member.role === "admin") return toast.error("관리자 권한을 해제한 뒤 이용정지할 수 있습니다.");
    const reason = (suspensionReasons[member.id] ?? "").trim();
    const endsAtValue = suspensionEndsAt[member.id] ?? "";
    if (!member.isSuspended && reason.length < 2) return toast.error("이용정지 사유를 2자 이상 입력해 주세요.");
    if (!member.isSuspended && !endsAtValue) return toast.error("해제 예정일을 입력해 주세요.");
    const action = member.isSuspended ? "이용정지를 해제" : "이용정지";
    if (!window.confirm(`${member.name ?? member.email ?? "이 회원"}의 ${action}를 진행할까요?${member.isSuspended ? "" : " 정지 후에는 로그인 전용 기능을 이용할 수 없습니다."}`)) return;
    setSuspension.mutate({ memberId: member.id, isSuspended: !member.isSuspended, reason: member.isSuspended ? null : reason, endsAt: member.isSuspended ? null : new Date(endsAtValue).toISOString() }, {
      onSuccess: async result => {
        await utils.members.list.invalidate();
        if (!result.isSuspended) {
          setSuspensionReasons(previous => ({ ...previous, [member.id]: "" }));
          setSuspensionEndsAt(previous => ({ ...previous, [member.id]: "" }));
        }
        toast.success(result.isSuspended ? "회원 이용을 정지했습니다." : "회원 이용정지를 해제했습니다.");
      },
    });
  };

  if (loading) return <p className="py-20 text-center text-sm text-[#718074]">관리자 권한을 확인하는 중입니다.</p>;
  if (!user) return <section className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-[#e2ebe1]"><Users className="mx-auto size-8 text-[#176b3a]" /><h1 className="mt-3 text-lg font-extrabold">회원 관리 로그인</h1><p className="mt-2 text-xs leading-5 text-[#718071]">관리자 Google 계정으로 로그인해야 회원 목록을 볼 수 있습니다.</p><a href="/api/auth/google" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#176b3a] px-5 text-xs font-bold text-white"><LogIn className="size-4" />Google 로그인</a></section>;
  if (!isAdmin) return <section className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-[#e2ebe1]"><ShieldOff className="mx-auto size-8 text-[#a44c45]" /><h1 className="mt-3 text-lg font-extrabold">접근 권한이 없습니다</h1><p className="mt-2 text-xs leading-5 text-[#718071]">관리자만 회원 목록을 조회할 수 있습니다.</p></section>;

  return <section className="space-y-5 pb-5">
    <header className="rounded-3xl bg-[#176b3a] p-5 text-white shadow-[0_12px_30px_rgba(23,107,58,.2)]">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-extrabold tracking-wide text-[#d9f0dd]">MEMBER MANAGEMENT</p><h1 className="mt-1 text-2xl font-extrabold tracking-[-0.05em]">회원 관리</h1></div><Link href="/admin" className="rounded-full bg-white/15 px-3 py-2 text-xs font-bold text-white">관리자 홈</Link></div>
      <p className="mt-3 text-xs leading-5 text-[#d9f0dd]">Google·카카오 로그인 회원의 가입일과 최근 로그인 정보를 확인합니다.</p>
      <div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-2xl bg-white/12 p-3"><p className="text-[10px] font-bold text-[#d9f0dd]">전체 회원</p><p className="mt-1 text-xl font-extrabold">{members.data?.length ?? "-"}<span className="ml-1 text-[10px]">명</span></p></div><div className="rounded-2xl bg-white/12 p-3"><p className="text-[10px] font-bold text-[#d9f0dd]">관리자</p><p className="mt-1 text-xl font-extrabold">{adminCount}<span className="ml-1 text-[10px]">명</span></p></div><div className="rounded-2xl bg-white/12 p-3"><p className="text-[10px] font-bold text-[#d9f0dd]">이용정지</p><p className="mt-1 text-xl font-extrabold">{suspendedCount}<span className="ml-1 text-[10px]">명</span></p></div></div>
    </header>

    <section className="rounded-3xl border border-[#dbe8dc] bg-white p-4 shadow-sm dark:border-[#31513c] dark:bg-[#183024]">
      <label className="flex items-center gap-2 rounded-xl border border-[#d9e6d9] bg-[#fbfdfb] px-3 focus-within:border-[#249450] dark:bg-[#102216]"><Search className="size-4 shrink-0 text-[#6d8975]" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="이름, 이메일, 로그인 방식 검색" className="min-w-0 flex-1 bg-transparent py-3 text-xs outline-none placeholder:text-[#9aaa9d] dark:text-[#e6f5e8]" /></label>
      <div className="mt-3 rounded-2xl bg-[#f4fbf5] p-3 text-[11px] leading-5 text-[#55705b] dark:bg-[#193625] dark:text-[#b9d9c0]"><UserCog className="mr-1 inline size-3.5" />회원 목록은 모든 관리자에게 표시됩니다. <strong>권한 변경과 이용정지는 지정 관리자 계정만</strong> 할 수 있으며, 정지된 회원은 로그인 전용 기능에 접근할 수 없습니다.</div>
    </section>

    <div className="space-y-3">
      {members.isLoading ? <p className="py-10 text-center text-sm text-[#718074]">회원 목록을 불러오는 중입니다.</p> : null}
      {!members.isLoading && filteredMembers.length === 0 ? <p className="rounded-3xl border border-dashed border-[#cbdacd] p-8 text-center text-sm text-[#718074]">조건에 맞는 회원이 없습니다.</p> : null}
      {filteredMembers.map(member => {
        const isPrimaryOwner = isAdminEmail(member.email);
        const canChangeRole = isOwner && !isPrimaryOwner && member.loginMethod === "google" && !member.isSuspended;
        const isMemberAdmin = member.role === "admin" || isPrimaryOwner;
        const canModerate = isOwner && !isPrimaryOwner && !isMemberAdmin;
        return <article key={member.id} className={`rounded-3xl border bg-white p-4 shadow-sm dark:bg-[#183024] ${member.isSuspended ? "border-[#e9beb8] bg-[#fffafa] dark:border-[#6b3b35]" : "border-[#dbe8dc] dark:border-[#31513c]"}`}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><h2 className="truncate text-sm font-extrabold text-[#203a27] dark:text-[#e6f5e8]">{member.name || "이름 미제공"}</h2>{member.isSuspended ? <span className="inline-flex items-center gap-1 rounded-full bg-[#fff0ee] px-2 py-0.5 text-[10px] font-bold text-[#a44c45]"><Ban className="size-3" />이용 정지</span> : isPrimaryOwner ? <span className="inline-flex items-center gap-1 rounded-full bg-[#fff2c8] px-2 py-0.5 text-[10px] font-bold text-[#8a6416]"><Crown className="size-3" />지정 관리자</span> : isMemberAdmin ? <span className="inline-flex items-center gap-1 rounded-full bg-[#e4f5e7] px-2 py-0.5 text-[10px] font-bold text-[#207542]"><ShieldCheck className="size-3" />관리자</span> : <span className="rounded-full bg-[#f1f4f1] px-2 py-0.5 text-[10px] font-bold text-[#68756a]">일반 회원</span>}</div><p className="mt-1 truncate text-xs text-[#627267] dark:text-[#aec9b5]">{member.email || "이메일 미제공"}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${member.loginMethod === "google" ? "bg-[#eef6ff] text-[#3673a9]" : member.loginMethod === "kakao" ? "bg-[#fff4b8] text-[#665000]" : "bg-[#f1f4f1] text-[#68756a]"}`}>{loginLabel(member.loginMethod)}</span></div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><p className="rounded-xl bg-[#f7faf7] p-2 text-[#65766a] dark:bg-[#102216] dark:text-[#aac3b0]"><CalendarDays className="mr-1 inline size-3" />가입 {formatDate(member.createdAt)}</p><p className="rounded-xl bg-[#f7faf7] p-2 text-[#65766a] dark:bg-[#102216] dark:text-[#aac3b0]"><LogIn className="mr-1 inline size-3" />최근 로그인 {formatDate(member.lastSignedIn)}</p></div>
          {member.isSuspended ? <div className="mt-3 rounded-xl border border-[#edc7c2] bg-[#fff5f3] p-3 text-[11px] leading-5 text-[#884640]"><p><strong>정지 시각</strong> {member.suspendedAt ? formatDate(member.suspendedAt) : "기록 없음"}</p><p className="mt-1"><strong>해제 예정</strong> {member.suspensionEndsAt ? formatDate(member.suspensionEndsAt) : "기록 없음"}</p><p className="mt-1"><strong>사유</strong> {member.suspensionReason || "기록 없음"}</p></div> : null}
          {isPrimaryOwner ? <p className="mt-3 text-[11px] font-medium text-[#8a6416]">지정 관리자 계정은 권한을 해제하거나 이용정지할 수 없습니다.</p> : canChangeRole ? <button type="button" onClick={() => changeRole(member)} disabled={setRole.isPending || setSuspension.isPending} className={`mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-xs font-extrabold disabled:opacity-60 ${isMemberAdmin ? "border border-[#ebc9c4] bg-[#fff7f6] text-[#a44c45]" : "bg-[#176b3a] text-white"}`}>{isMemberAdmin ? <><ShieldOff className="size-4" />관리자 권한 해제</> : <><ShieldCheck className="size-4" />관리자 권한 지정</>}</button> : null}
          {canModerate ? <div className="mt-3">{!member.isSuspended ? <div className="space-y-2"><textarea value={suspensionReasons[member.id] ?? ""} onChange={event => setSuspensionReasons(previous => ({ ...previous, [member.id]: event.target.value }))} placeholder="이용정지 사유를 입력하세요 (필수)" maxLength={500} className="min-h-20 w-full rounded-xl border border-[#e8c9c5] bg-[#fffafa] p-3 text-xs outline-none placeholder:text-[#b0908c] focus:border-[#cc665c] dark:bg-[#2a1817]" /><label className="block rounded-xl border border-[#e8c9c5] bg-[#fffafa] px-3 py-2 text-[10px] font-bold text-[#884640]">해제 예정일 (필수)<input type="datetime-local" value={suspensionEndsAt[member.id] ?? ""} min={toDateTimeLocalValue(new Date())} onChange={event => setSuspensionEndsAt(previous => ({ ...previous, [member.id]: event.target.value }))} className="mt-1 block w-full bg-transparent text-xs font-medium text-[#4b2a27] outline-none dark:text-[#f3d0cb]" /></label></div> : null}<button type="button" onClick={() => changeSuspension(member)} disabled={setSuspension.isPending} className={`mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-xs font-extrabold disabled:opacity-60 ${member.isSuspended ? "border border-[#afcdb5] bg-[#f3fbf4] text-[#176b3a]" : "bg-[#a44c45] text-white"}`}>{member.isSuspended ? <><RotateCcw className="size-4" />이용정지 해제</> : <><Ban className="size-4" />이용 정지</>}</button></div> : !isPrimaryOwner ? <p className="mt-3 text-[11px] text-[#718074]">{isMemberAdmin ? "관리자 권한을 해제한 뒤 이용정지할 수 있습니다." : "이용정지 변경은 지정 관리자 계정에서만 가능합니다."}</p> : null}
        </article>;
      })}
    </div>
  </section>;
}
