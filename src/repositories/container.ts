// 레포지토리 주입 컨테이너(배럴이 아니다 — ADR-0006). 런타임 조립은 src/app/providers.tsx,
// 테스트 조립은 src/test/setup.ts 가 한다. 여기서 구현을 import 하지 않는 것이 요점이다.
import type { CategoryRepository } from '@/repositories/category-repository';
import type { DatasetRepository } from '@/repositories/dataset-repository';
import type { DdayRepository } from '@/repositories/dday-repository';
import type { DiaryRepository } from '@/repositories/diary-repository';
import type { FocusSessionRepository } from '@/repositories/focus-session-repository';
import type { RoutineRepository } from '@/repositories/routine-repository';
import type { SettingsRepository } from '@/repositories/settings-repository';
import type { SocialRepository } from '@/repositories/social-repository';
import type { SyncRepository } from '@/repositories/sync-repository';
import type { SyncTransport } from '@/repositories/sync-transport';
import type { TodoRepository } from '@/repositories/todo-repository';

/**
 * 앱이 쓰는 저장소 묶음. 넷(todos·categories·settings·focusSessions)은 엔티티 저장소이고 `dataset`
 * 은 별개 계약이다 (ADR-0009). `dday`(calendar.md, ADR-0016)·`diaryEntries`(diary.md, ADR-0016)는
 * `dataset`(백업/복원)에 아직 들어가지 않는 독립 저장소다 — 그래서 그 넷과 같은 테이블 공유 계약을
 * 지지 않는다(memory/repositories.ts 주석). `routines`(routine.md, ADR-0017)는 반대로 **그 넷과 같은
 * 테이블 묶음을 공유한다** — 무기한 루틴의 지연 생성이 만드는 투두와 루틴 워터마크를 `dataset.write()`
 * 한 트랜잭션으로 커밋해야 하기 때문이다. `sync`(ADR-0018)는 아웃박스·동기화 표식(`syncState`) 저장소다
 * — 엔티티 저장소와 같은 물리 저장소(트랜잭션)를 공유해야 하지만(쓰기마다 아웃박스에 적재), 계약 자체는
 * `dataset` 처럼 독립적이다.
 */
export type Repositories = {
  todos: TodoRepository;
  categories: CategoryRepository;
  settings: SettingsRepository;
  focusSessions: FocusSessionRepository;
  dataset: DatasetRepository;
  dday: DdayRepository;
  diaryEntries: DiaryRepository;
  routines: RoutineRepository;
  sync: SyncRepository;
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

let currentTransport: SyncTransport | undefined;

/**
 * 동기화 트랜스포트를 주입한다. `Repositories` 와 **별개 슬롯**이다 — memory 가짜 서버가 앱 번들에
 * 새지 않게 하는 경계이자(`sync-repository.ts` 머리주석, §C-6), 실제 왕복(`http-transport.ts`)이
 * `createIndexedDbRepositories()` 와 다른 시점·다른 방식(fetch)으로 조립되기 때문이다.
 */
export function setSyncTransport(next: SyncTransport): void {
  currentTransport = next;
}

/** 주입된 트랜스포트를 돌려준다. 기본값은 없다 — `getRepositories()` 와 같은 규칙. */
export function getSyncTransport(): SyncTransport {
  if (currentTransport === undefined) {
    throw new Error(
      '동기화 트랜스포트가 주입되지 않았습니다. setSyncTransport() 를 먼저 호출하세요.',
    );
  }
  return currentTransport;
}

let currentSocial: SocialRepository | undefined;

/** 온라인 소셜 포트는 개인 저장소 묶음이나 동기화 아웃박스에 속하지 않는다. */
export function setSocialRepository(next: SocialRepository): void {
  currentSocial = next;
}

export function getSocialRepository(): SocialRepository {
  if (currentSocial === undefined) {
    throw new Error('소셜 저장소가 주입되지 않았습니다. setSocialRepository() 를 먼저 호출하세요.');
  }
  return currentSocial;
}
