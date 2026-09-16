// 선택 날짜의 투두를 메모리에 올리는 훅 (todo.md R17). 화면에 한 번만 마운트한다.
import { useEffect } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import type { TodoLoadStatus } from '@/features/todo/store/todo-state';
import { useTodoStore } from '@/features/todo/store/todo-store';

/** 적재 결과. `error` 는 적재 실패와 직전 쓰기 실패가 함께 쓰는 자리다. */
export type TodoDateState = { status: TodoLoadStatus; error: string | null };

/**
 * `date` 가 바뀔 때마다 그 날짜의 투두를 다시 읽는다. 늦게 도착한 이전 요청의 응답은 스토어가 버린다.
 *
 * `useEffect` 를 쓰는 이유는 파생 상태 동기화가 아니라 **외부 저장소 읽기**이기 때문이다
 * (code-style §3 이 금지하는 것은 렌더로 계산할 수 있는 값을 effect 로 맞추는 쪽이다).
 * 같은 날짜로 두 컴포넌트가 이 훅을 부르면 읽기가 두 번 일어난다 — 그래서 호출 지점은 화면당 하나다.
 */
export function useTodoDate(date: DateKey): TodoDateState {
  const status = useTodoStore((state) => state.status);
  const error = useTodoStore((state) => state.error);
  const loadDate = useTodoStore((state) => state.loadDate);

  useEffect(() => {
    void loadDate(date);
  }, [date, loadDate]);

  return { status, error };
}
