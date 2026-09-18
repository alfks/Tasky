'use client';

// 보이는 날짜 범위의 요약(점·✓) 조회 (date-strip.md §2-C·§4·R7·R8·R17).
//
// 셀·숫자는 즉시 그리고 요약만 늦게 붙는다 — 그래서 로딩 상태를 따로 내보내지 않고 `undefined`
// 하나로 "아직 없음"을 표현한다(스켈레톤 없음, §2-C).
//
// **`undefined` 로 비우는 조건은 "보이는 범위가 바뀌었다" 하나뿐이다** (T-56). 요약은 범위가 바뀔 때만
// 다시 읽는 것이 아니라 투두를 쓸 때마다 다시 읽는데, 다시 읽을 때마다 비우면 체크 한 번에 화면
// 전체의 점·✓ 가 사라졌다 다시 나타난다. 그래서 상태에 **어느 범위의 요약인지**를 함께 담고
// (`{ from, to, summaries }`) 비우기는 `useEffect` 가 아니라 **렌더 중 대조**로 한다 — 범위가 바뀌면
// 그 렌더에서 이미 `undefined` 이고, 그 밖의 재조회에서는 새 값이 도착할 때까지 이전 요약이 남는다.
// 실패 경로도 같은 이유로 상태를 건드리지 않는다(이미 보이던 점을 재조회 실패가 지우면 안 된다).
//
// **주가 아니라 범위를 받는다**(T-69): 월 보기의 격자는 28~42칸이지만 주 보기의 7칸과 마찬가지로
// **연속 범위**라, 양끝만 알면 `listByDateRange` 한 번으로 둘 다 읽힌다. 훅을 주 전용으로 두고 월용을
// 따로 만들면 위의 무효화 규약이 두 벌이 되고, 한쪽만 고쳐지는 순간 T-56 이 고친 결함이 월 보기에서
// 되살아난다 — 그래서 조회 단위를 "보이는 날짜 전부"로 넓히고 구현은 하나로 둔다.
import { useEffect, useRef, useState } from 'react';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';
import type { CategoryId } from '@/domain/ids';
import { summarizeDays, type DaySummary } from '@/domain/todo/day-summary';

import { getRepositories } from '@/repositories/container';

import { addDays } from '@/lib/date';

/** 요약 조회 실패 시 앱 셸 토스트에 띄울 문구 (§2-C). 토스트 자체는 앱 셸 소관이다. */
export const SUMMARY_ERROR_MESSAGE = '날짜별 요약을 불러오지 못했어요. 다시 시도해 주세요.';

/**
 * `from`~`to` 를 하루씩 펼친다(양끝 포함). `DateKey` 는 0 채움 고정폭이라 사전순 비교가 날짜 순서와 같다.
 * `from > to` 면 빈 배열이고, 그때는 조회 자체를 하지 않는다.
 */
function rangeDays(from: DateKey, to: DateKey): DateKey[] {
  const days: DateKey[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/**
 * 보이는 날짜 전부의 요약을 **한 번의 범위 조회**로 읽는다 (R7·R8·R17).
 *
 * 카테고리를 두 번 묻는 이유: `list({ includeClosed: true })` 는 툼스톤을 감추는데(ADR-0007 결정 4)
 * R7 은 **삭제된 카테고리의 색까지** 세라고 한다. 그래서 살아 있는 목록에서 못 찾은 id 만 모아
 * `listDeletedByIds` 로 한 번 더 묻는다 — 지워진 카테고리를 참조하는 투두가 없으면 두 번째 조회는
 * 아예 나가지 않고, 나갈 때도 "이미 못 찾은 id" 만 실린다(ADR-0014 가 남용을 막는 방식).
 */
async function loadRangeSummaries(days: readonly DateKey[]): Promise<Map<DateKey, DaySummary>> {
  const { todos, categories } = getRepositories();
  const [todoList, living] = await Promise.all([
    // 칸 수와 무관하게 조회는 이 한 번이다 — 42칸이어도 42번 묻지 않는다 (R17).
    todos.listByDateRange(days[0], days[days.length - 1]),
    // 종료된 카테고리의 투두도 점으로 세야 한다 (R7).
    categories.list({ includeClosed: true }),
  ]);
  const known = new Set<CategoryId>(living.map((category) => category.id));
  const missing = [...new Set(todoList.map((todo) => todo.categoryId))].filter(
    (id) => !known.has(id),
  );
  const deleted: Category[] =
    missing.length === 0
      ? []
      : // `historyHidden`(category R22)이 켜진 카테고리는 제외한다 — 삭제 시점에 "지난 기록에서도
        // 이름·색 지우기"를 고른 카테고리는 점 색도 복원하지 않는다.
        (await categories.listDeletedByIds(missing)).filter(
          (category) => category.historyHidden !== true,
        );
  // 순서(활성 → 종료 → 삭제됨)는 도메인 `sortCategoriesForDisplay` 가 정한다 — 여기서는 합치기만 한다.
  return summarizeDays(days, todoList, [...living, ...deleted]);
}

/** 읽은 요약 + **어느 범위의 것인지**. 범위가 바뀌면 렌더 중 대조만으로 옛 범위의 요약이 걸러진다. */
type LoadedRange = {
  readonly from: DateKey;
  readonly to: DateKey;
  readonly summaries: Map<DateKey, DaySummary>;
};

/**
 * `from`~`to`(양끝 포함) 날짜들의 요약. 아직 못 읽었거나 실패하면 `undefined`.
 *
 * 주 보기는 7일, 월 보기는 그 달의 격자 전체(28~42일)를 넘긴다 — 훅은 길이를 모른다.
 *
 * `revision` 은 **저장소가 바뀌었다는 신호**다 — 값이 바뀌면 같은 범위를 다시 읽는다(T-56). 스트립은
 * 자기 투두를 따로 조회해 캐시하므로, 이 신호가 없으면 체크·추가·삭제·가져오기 뒤에도 점·✓ 와 셀
 * 접근성 이름이 낡은 채로 남는다. **월 보기도 같은 신호 하나를 탄다** — 보기마다 의존성을 따로 쓰면
 * 한쪽에서만 무효화가 빠지는 사고가 난다. 어떤 값을 합쳐 넣을지는 셸이 정한다(`ShellHeader`).
 *
 * `onError` 는 실패할 때 한 번 불린다(렌더 중이 아니라 비동기 경로에서).
 */
export function useRangeSummaries(
  from: DateKey,
  to: DateKey,
  revision: number,
  onError?: (message: string) => void,
): Map<DateKey, DaySummary> | undefined {
  const [loaded, setLoaded] = useState<LoadedRange | undefined>(undefined);
  // 콜백 정체성이 바뀌어도 재조회하지 않게 ref 로 받는다 — 호출부가 useCallback 을 쓰도록 강요하지 않는다.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    const days = rangeDays(from, to);
    if (days.length === 0) return;

    loadRangeSummaries(days)
      .then((next) => {
        if (cancelled) return;
        setLoaded({ from, to, summaries: next });
      })
      .catch(() => {
        if (cancelled) return;
        // 상태를 비우지 않는다: 범위가 바뀐 직후라면 아래 대조가 이미 `undefined` 를 돌려주고,
        // 같은 범위를 다시 읽다 실패한 것이라면 이미 보이던 점이 사라질 이유가 없다 (§2-C).
        onErrorRef.current?.(SUMMARY_ERROR_MESSAGE);
      });

    return () => {
      cancelled = true;
    };
  }, [from, to, revision]);

  // 렌더 중 파생 — 범위가 바뀐 렌더에서 `useEffect` 를 기다리지 않고 옛 범위의 점이 즉시 사라진다.
  return loaded?.from === from && loaded.to === to ? loaded.summaries : undefined;
}
