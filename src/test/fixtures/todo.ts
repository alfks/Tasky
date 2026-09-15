// 투두 픽스처 팩토리. 기본값은 전부 결정적이며(고정 날짜·시각·id) 필요한 필드만 override 한다.
import type { Todo } from '@/domain/todo/todo';

import { FIXTURE_DATE, FIXTURE_INSTANT, fixtureId } from '@/test/fixtures/deps';

/** 기본 카테고리 id — `makeCategory()` 의 기본 id 와 같은 값이라 그대로 짝이 맞는다. */
export const FIXTURE_CATEGORY_ID = fixtureId('category');

/** 한 건. `seq` 는 id·order 를 함께 정해 목록 픽스처가 서로 부딪히지 않게 한다. */
export function makeTodo(overrides: Partial<Todo> & { seq?: number } = {}): Todo {
  const { seq = 1, ...rest } = overrides;
  return {
    id: fixtureId('todo', seq),
    createdAt: FIXTURE_INSTANT,
    updatedAt: FIXTURE_INSTANT,
    rev: 1,
    categoryId: FIXTURE_CATEGORY_ID,
    date: FIXTURE_DATE,
    title: `할 일 ${seq}`,
    done: false,
    order: seq - 1,
    ...rest,
  };
}

/** `count` 개를 `order` 0..count-1 로. 개별 override 는 `patch(index)` 로 준다. */
export function makeTodos(
  count: number,
  patch: (index: number) => Partial<Todo> = () => ({}),
): Todo[] {
  return Array.from({ length: count }, (_, index) => makeTodo({ seq: index + 1, ...patch(index) }));
}
