// 레포지토리 주입 컨테이너(배럴이 아니다 — ADR-0006). 런타임 조립은 src/app/providers.tsx,
// 테스트 조립은 src/test/setup.ts 가 한다. 여기서 구현을 import 하지 않는 것이 요점이다.
import type { CategoryRepository } from '@/repositories/category-repository';
import type { DatasetRepository } from '@/repositories/dataset-repository';
import type { DdayRepository } from '@/repositories/dday-repository';
import type { FocusSessionRepository } from '@/repositories/focus-session-repository';
import type { RoutineRepository } from '@/repositories/routine-repository';
import type { SettingsRepository } from '@/repositories/settings-repository';
import type { TodoRepository } from '@/repositories/todo-repository';

/**
 * 앱이 쓰는 저장소 묶음. 넷(todos·categories·settings·focusSessions)은 엔티티 저장소이고 `dataset`
 * 은 별개 계약이다 (ADR-0009). `dday`(calendar.md, ADR-0016)는 `dataset`(백업/복원)에 아직 들어가지
 * 않는 독립 저장소다 — 그래서 그 넷과 같은 테이블 공유 계약을 지지 않는다(memory/repositories.ts 주석).
 * `routines`(routine.md, ADR-0017)는 반대로 **그 넷과 같은 테이블 묶음을 공유한다** — 무기한 루틴의
 * 지연 생성이 만드는 투두와 루틴 워터마크를 `dataset.write()` 한 트랜잭션으로 커밋해야 하기 때문이다.
 */
export type Repositories = {
  todos: TodoRepository;
  categories: CategoryRepository;
  settings: SettingsRepository;
  focusSessions: FocusSessionRepository;
  dataset: DatasetRepository;
  dday: DdayRepository;
  routines: RoutineRepository;
};

let current: Repositories | undefined;

/** 저장소 구현을 주입한다. 조립 지점에서 앱 시작 시 한 번 호출한다. */
export function setRepositories(next: Repositories): void {
  current = next;
}

/** 주입된 저장소를 돌려준다. 기본값은 없다 — 조립 누락을 조기에 드러낸다. */
export function getRepositories(): Repositories {
  if (current === undefined) {
    throw new Error('레포지토리가 주입되지 않았습니다. setRepositories() 를 먼저 호출하세요.');
  }
  return current;
}
