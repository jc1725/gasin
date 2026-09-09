import { Link } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminUser } from "@shared/const";
import { trpc } from "@/lib/trpc";

const formatDate = (value: Date) => new Date(value).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const statusLabel = { pending: "검토 대기", reviewing: "검토 중", added: "등록 완료", dismissed: "미등록" } as const;
const statusStyle = { pending: "bg-[#fff2d8] text-[#94601a]", reviewing: "bg-[#e8f1ff] text-[#3567a8]", added: "bg-[#e7f3e9] text-[#176b3a]", dismissed: "bg-[#f0f2f0] text-[#657365]" } as const;

export default function AdminProductRequests() {
  const { user, loading } = useAuth();
  const isAdmin = isAdminUser(user);
  const utils = trpc.useUtils();
  const requests = trpc.productRequests.listForAdmin.useQuery(undefined, { enabled: isAdmin });
  const updateStatus = trpc.productRequests.updateStatus.useMutation({
    onSuccess: async result => {
      await utils.productRequests.listForAdmin.invalidate();
      if ("searched" in result && result.searched) {
        toast.success(result.resultCount > 0 ? `쿠팡 API 검색 완료 · ${result.resultCount}개 상품을 등록했습니다.` : `쿠팡 API 검색 결과가 없어 ‘${statusLabel[result.status]}’로 남겼습니다.`);
      } else {
        toast.success(`요청 상태를 ‘${statusLabel[result.status]}’로 변경했습니다.`);
      }
    },
    onError: error => toast.error(error.message),
  });

  if (loading) return <p className="py-24 text-center text-sm text-[#829184]">관리자 확인 중입니다.</p>;
  if (!user || !isAdmin) return <section className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-[#e2ebe1]"><ShieldCheck className="mx-auto size-8 text-[#a44c45]" /><h1 className="mt-3 text-lg font-extrabold">접근 권한이 없습니다</h1><p className="mt-2 text-xs leading-5 text-[#718071]">지정된 관리자 계정만 상품 추가 요청을 볼 수 있습니다.</p></section>;

  return <section>
    <div className="mb-5 flex items-center justify-between"><Link href="/admin" className="grid size-10 place-items-center rounded-full bg-white text-[#36543e] shadow-sm ring-1 ring-[#e2ebe1]" aria-label="가격 관리로 돌아가기"><ArrowLeft className="size-4" /></Link><button type="button" onClick={() => requests.refetch()} className="grid size-10 place-items-center rounded-full bg-white text-[#176b3a] shadow-sm ring-1 ring-[#e2ebe1]" aria-label="상품 추가 요청 새로고침"><RefreshCw className="size-4" /></button></div>
    <header className="rounded-3xl bg-[#176b3a] p-5 text-white shadow-[0_12px_30px_rgba(23,107,58,.2)]"><p className="text-xs font-bold tracking-wide text-[#d9f0dd]">ADMIN ONLY · PRODUCT REQUESTS</p><h1 className="mt-2 text-xl font-extrabold tracking-[-0.05em]">사용자 상품 추가 요청</h1><p className="mt-2 text-xs leading-5 text-[#d9f0dd]">원하는 상품이 없을 때 남긴 요청을 검색어·횟수·시각 중심으로 검토합니다. 사용자 이메일과 IP는 저장하지 않습니다. ‘등록 완료’는 쿠팡 API를 즉시 호출해 결과가 있을 때만 추적 목록에 반영합니다.</p></header>
    <section className="mt-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-[#e2ebe1]">{requests.isLoading ? <p className="py-12 text-center text-xs text-[#718071]">상품 추가 요청을 불러오는 중입니다.</p> : null}{requests.data?.length === 0 ? <p className="rounded-2xl bg-[#f4f7f3] p-5 text-center text-xs text-[#718071]">아직 들어온 상품 추가 요청이 없습니다.</p> : null}{requests.data?.length ? <div className="divide-y divide-[#edf1ed]">{requests.data.map(request => <article key={request.id} className="py-4 first:pt-0 last:pb-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-[#25362a]">{request.keyword}</p><p className="mt-1 text-[10px] text-[#718071]">요청 {request.requestCount}회 · 최근 {formatDate(request.lastRequestedAt)}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${statusStyle[request.status]}`}>{statusLabel[request.status]}</span></div><div className="mt-3 flex flex-wrap gap-1.5"><button type="button" onClick={() => updateStatus.mutate({ requestId: request.id, status: "reviewing" })} disabled={updateStatus.isPending || request.status === "reviewing"} className="min-h-8 rounded-lg border border-[#bfd4eb] px-2.5 text-[10px] font-bold text-[#3567a8] disabled:opacity-50">검토 중</button><button type="button" onClick={() => updateStatus.mutate({ requestId: request.id, status: "added" })} disabled={updateStatus.isPending || request.status === "added"} className="min-h-8 rounded-lg bg-[#176b3a] px-2.5 text-[10px] font-bold text-white disabled:opacity-50">쿠팡 API 검색 후 등록</button><button type="button" onClick={() => updateStatus.mutate({ requestId: request.id, status: "dismissed" })} disabled={updateStatus.isPending || request.status === "dismissed"} className="min-h-8 rounded-lg bg-[#f1f4f1] px-2.5 text-[10px] font-bold text-[#607765] disabled:opacity-50">미등록</button></div></article>)}</div> : null}</section>
  </section>;
}
