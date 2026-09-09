import { useState } from "react";
import { AlertTriangle, CalendarClock, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";

const formatDate = (value: Date | string) => new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}).format(new Date(value));

export default function SuspensionNotice() {
  const notice = trpc.auth.suspensionStatus.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const [dismissed, setDismissed] = useState(false);
  const status = notice.data;

  if (!status?.isSuspended || dismissed) return null;

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-[#102016]/55 p-5 backdrop-blur-sm" role="presentation">
    <section role="alertdialog" aria-modal="true" aria-labelledby="suspension-title" className="w-full max-w-sm rounded-3xl border border-[#edc8c2] bg-white p-5 shadow-[0_24px_70px_rgba(20,33,22,.32)] dark:bg-[#1d2820]">
      <div className="grid size-12 place-items-center rounded-2xl bg-[#fff0ee] text-[#a44c45]"><ShieldAlert className="size-6" /></div>
      <p className="mt-4 text-[11px] font-extrabold tracking-wide text-[#a44c45]">ACCOUNT SUSPENDED</p>
      <h1 id="suspension-title" className="mt-1 text-xl font-extrabold text-[#26362a] dark:text-[#edf8ef]">회원 이용이 정지되었습니다</h1>
      <p className="mt-2 text-xs leading-5 text-[#607166] dark:text-[#bad0bf]">현재 로그인 전용 기능을 이용할 수 없습니다. 아래 정지 사유와 해제 예정일을 확인해 주세요.</p>
      <div className="mt-4 rounded-2xl bg-[#fff7f6] p-3 text-xs leading-5 text-[#85453e] dark:bg-[#321d1b] dark:text-[#f1c9c3]"><AlertTriangle className="mr-1 inline size-3.5" /><strong>정지 사유</strong><p className="mt-1 whitespace-pre-wrap">{status.reason}</p></div>
      <div className="mt-3 rounded-2xl bg-[#f4fbf5] p-3 text-xs leading-5 text-[#456c4e] dark:bg-[#173221] dark:text-[#c4e5ca]"><CalendarClock className="mr-1 inline size-3.5" /><strong>해제 예정일</strong><p className="mt-1 font-bold">{status.endsAt ? formatDate(status.endsAt) : "관리자 검토 후 별도 안내"}</p><p className="mt-1 text-[10px] opacity-80">해제 예정일은 자동 해제를 보장하지 않으며, 관리자 검토 후 이용이 재개됩니다.</p></div>
      <button type="button" onClick={() => setDismissed(true)} className="mt-5 min-h-11 w-full rounded-2xl bg-[#26362a] px-4 text-xs font-extrabold text-white transition active:scale-[.97] dark:bg-[#e5f2e7] dark:text-[#183024]">확인</button>
    </section>
  </div>;
}
