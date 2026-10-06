/**
 * 2026-10-06: 가격 재확인이 검색 결과를 새 추적 상품으로 저장하던 버그(d3faa82에서 수정)로
 * 아무도 보지 않은 search 상품이 약 2만 8천 개 쌓였다. Railway 콘솔에서 한 번에 UPDATE를
 * 돌렸지만 실제로 반영된 건 300개 정도뿐이었다(콘솔 쿼리 시간 제한/커밋 문제로 추정).
 * 그래서 서버가 직접, 작은 묶음으로 나눠 정리하고 몇 개가 바뀌었는지 돌려준다.
 *
 * 정리 대상(모두 만족): 활성 · source=search · 옵션 라벨 없음 · 상세 조회 기록 없음 ·
 * 찜 없음 · 수동 링크 추적 없음. 비활성으로만 돌리고(deactivatedAt 기록), 실제 삭제는
 * 기존 보존 작업(deleteExpiredInactiveProducts)이 90일 뒤에 한다 — 그 사이에 누군가
 * 검색 결과에서 상품을 열면 upsert가 다시 활성으로 되돌린다.
 */
export const UNUSED_SEARCH_CLEANUP_BATCH_SIZE = 2000;
export const UNUSED_SEARCH_CLEANUP_MAX_BATCHES = 10;

export type ChunkedDeactivationDeps = {
  selectBatch: (limit: number) => Promise<number[]>;
  deactivate: (ids: number[]) => Promise<number>;
};

export async function runChunkedDeactivation(
  deps: ChunkedDeactivationDeps,
  options: { batchSize?: number; maxBatches?: number } = {},
) {
  const batchSize = options.batchSize ?? UNUSED_SEARCH_CLEANUP_BATCH_SIZE;
  const maxBatches = options.maxBatches ?? UNUSED_SEARCH_CLEANUP_MAX_BATCHES;
  let deactivatedCount = 0;
  let batches = 0;
  let reachedEnd = false;
  while (batches < maxBatches) {
    const ids = await deps.selectBatch(batchSize);
    if (ids.length === 0) {
      reachedEnd = true;
      break;
    }
    batches += 1;
    const changed = await deps.deactivate(ids);
    deactivatedCount += changed;
    if (ids.length < batchSize) {
      reachedEnd = true;
      break;
    }
    // 고른 행이 하나도 바뀌지 않았다면(동시에 다른 작업이 먼저 바꿨거나 조건이 어긋남)
    // 같은 행을 계속 다시 고르며 헛돌 수 있으니 멈춘다.
    if (changed === 0) break;
  }
  return { deactivatedCount, batches, reachedEnd };
}

export function describeUnusedSearchCleanup(result: { deactivatedCount: number; remainingCount: number }) {
  const head = `안 쓰는 검색 상품 ${result.deactivatedCount.toLocaleString("ko-KR")}개를 숨김 처리했습니다.`;
  const tail = result.remainingCount > 0
    ? ` 아직 ${result.remainingCount.toLocaleString("ko-KR")}개가 남았습니다. 버튼을 한 번 더 눌러주세요.`
    : " 남은 대상은 없습니다. 숨긴 상품은 90일 뒤 자동 삭제됩니다.";
  return head + tail;
}
