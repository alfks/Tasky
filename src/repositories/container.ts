// 레포지토리 주입 컨테이너(배럴이 아니다 — ADR-0006). 런타임 조립은 src/app/providers.tsx,
// 테스트 조립은 src/test/setup.ts 가 한다.
import type { CategoryRepository } from '@/repositories/category-repository';
import type { SettingsRepository } from '@/repositories/settings-repository';
import type { TodoRepository } from '@/repositories/todo-repository';

/** 앱이 쓰는 저장소 묶음. */
export type Repositories = {
  todos: TodoRepository;
  categories: CategoryRepository;
  settings: SettingsRepository;
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
