// 지연 청크(엔진이 정적 import 한다 — T94_LAZY_BOUNDARY.md §D-10). `applyRemote` 가 채택한
// 테이블만 해당 feature 스토어의 재조회 액션을 부른다. 엔진(지연) → feature 스토어(진입)
// 방향이라 새 청크가 생기지 않는다(같은 문서 실측: `@/features/{calendar,category,diary,todo}`
// 를 import 해도 별도 청크가 안 생겼다).
import type { SyncTable } from '@/domain/sync/wire';

import { useDdayStore } from '@/features/calendar';
import { useCategoryStore } from '@/features/category';
import { useDiaryStore } from '@/features/diary';
import type { SyncRuntime } from '@/features/sync/store/sync-store';
import { useThemeStore } from '@/features/theme';
import { useTimerStore } from '@/features/timer';
import { useTodoStore } from '@/features/todo';

/**
 * `applyRemote` 가 돌려준 `adopted`(테이블별 채택 건수) 중 0 보다 큰 테이블만 재조회한다.
 * 프로필 재조회만 `rt` 로 받는다 — `@/features/profile` 배럴을 여기서 정적으로 import 하면 진입
 * 청크가 갈라진다(`SyncRuntime.reloadProfile` 주석).
 */
export async function reloadAdoptedViews(
  adopted: Readonly<Record<SyncTable, number>>,
  rt: Pick<SyncRuntime, 'reloadProfile'>,
): Promise<void> {
  const jobs: Promise<void>[] = [];

  // todos·routines 는 같은 화면(날짜별 목록)을 채운다 — 루틴 재조회 전용 액션이 없다(loadDate 가
  // 곧 그 날짜의 투두+루틴 인스턴스를 다시 읽는다).
  if (adopted.todos > 0 || adopted.routines > 0) {
    const todo = useTodoStore.getState();
    if (todo.date !== null) jobs.push(todo.loadDate(todo.date));
  }
  if (adopted.categories > 0) {
    jobs.push(useCategoryStore.getState().load());
  }
  if (adopted.ddays > 0) {
    jobs.push(useDdayStore.getState().load());
  }
  if (adopted.diaryEntries > 0) {
    const diary = useDiaryStore.getState();
    const date = useTodoStore.getState().date;
    if (date !== null) jobs.push(diary.load(date));
  }
  if (adopted.focusSessions > 0) {
    jobs.push(useTimerStore.getState().refresh());
  }
  if (adopted.settings > 0) {
    jobs.push(useThemeStore.getState().reloadFromStorage());
    // 프로필 세 필드도 같은 설정 행이다(profile.md R15) — 테마와 나란히 다시 읽는다.
    jobs.push(rt.reloadProfile());
  }

  await Promise.all(jobs);
}
