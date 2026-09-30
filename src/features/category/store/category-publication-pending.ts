/** 미확정 개인 항목의 중립 표시만 보관한다. 공개 내용·소유권·key는 담지 않는다. */
let ids: readonly string[] = Object.freeze([]);
const listeners = new Set<() => void>();
let producer = 0;
let stopProducer: (() => void) | null = null;
export const getPendingCategoryIds = () => ids;
export function subscribePendingCategoryIds(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function publish(next: readonly string[] | null): void {
  if (next === null || (next.length === ids.length && next.every((id, index) => id === ids[index])))
    return;
  ids = Object.freeze([...next]);
  for (const listener of listeners) listener();
}
export function clearPendingCategories(): void {
  producer += 1;
  stopProducer?.();
  stopProducer = null;
  publish([]);
}
/** 제작자는 선택 청크의 탭 수명을 가지며 특정 셸 hook을 포착하지 않는다. */
export function registerPendingCategories(
  readIds: () => readonly string[] | null,
  subscribe: (listener: () => void) => () => void,
): void {
  const current = ++producer;
  stopProducer?.();
  const refresh = () => {
    if (current !== producer) return;
    try {
      publish(readIds());
    } catch {
      /* 승인 없이 확인 표시를 없애지 않는다. */
    }
  };
  stopProducer = subscribe(refresh);
  refresh();
}
