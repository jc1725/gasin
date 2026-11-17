import { dehydrate, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import superjson from "superjson";
import App, { preloadRouteForPath } from "./App";
import { prefetchForPath, type HeadMeta, type SsrPrefetch } from "./ssr/prefetch";

// App.tsx의 라우트 Suspense fallback과 같은 문구여야 한다.
const ROUTE_FALLBACK_MARKER = 'aria-label="페이지를 불러오는 중"';

export type RenderResult = {
  html: string;
  dehydratedState: unknown;
  head: HeadMeta;
};

export async function render(url: string, prefetch: SsrPrefetch): Promise<RenderResult> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const queryIndex = url.indexOf("?");
  const ssrPath = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const ssrSearch = queryIndex === -1 ? "" : url.slice(queryIndex + 1);
  await preloadRouteForPath(ssrPath);
  const head = await prefetchForPath(url, queryClient, prefetch);
  const trpcClient = trpc.createClient({
    links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })],
  });
  const renderApp = () => renderToString(
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Router ssrPath={ssrPath} ssrSearch={ssrSearch}>
          <App />
        </Router>
      </QueryClientProvider>
    </trpc.Provider>
  );
  let html = renderApp();
  // React.lazy는 모듈이 이미 로드돼 있어도 서버 프로세스의 첫 렌더에서는 한 틱 뒤에야 준비된다.
  // renderToString은 기다려 주지 않아 라우트 Suspense fallback만 출력되므로(재시작 직후 첫 크롤러가
  // 빈 본문을 받고 그 HTML이 캐시됨), fallback이 보이면 이벤트 루프를 한 번 넘긴 뒤 다시 렌더한다.
  for (let attempt = 0; attempt < 3 && html.includes(ROUTE_FALLBACK_MARKER); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
    html = renderApp();
  }
  return { html, dehydratedState: dehydrate(queryClient), head };
}
