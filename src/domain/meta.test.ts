import { describe, expect, it } from 'vitest';

import {
  createMeta,
  isTombstone,
  markDeleted,
  touch,
  type MetaDeps,
  type Persistable,
} from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import type { TodoRepository } from '@/repositories/todo-repository';

const T0 = '2026-01-15T00:00:00.000Z';
const T1 = '2026-01-15T09:30:00.000Z';

const deps: MetaDeps = { now: () => T0, id: () => 'todo-1' };

const makePlainTodo = (): Todo => ({
  id: 'todo-1',
  createdAt: T0,
  updatedAt: T0,
  rev: 1,
  categoryId: 'category-1',
  date: '2026-01-15',
  title: '아침 스트레칭',
  done: false,
  order: 0,
});

const noopRepository: TodoRepository = {
  getById: async () => undefined,
  listByDate: async () => [],
  listAll: async () => [],
  upsert: async () => undefined,
};

const FIELDS = {
  categoryId: 'category-1',
  date: '2026-01-15',
  title: '아침 스트레칭',
  done: false,
  order: 0,
} as const;

describe('createMeta', () => {
  it('주입한 시각과 ID 로 rev 1 의 엔티티를 만든다', () => {
    const todo = createMeta<Todo>(deps, FIELDS);

    expect(todo.id).toBe('todo-1');
    expect(todo.createdAt).toBe(T0);
    expect(todo.updatedAt).toBe(T0);
    expect(todo.rev).toBe(1);
    expect(todo.deletedAt).toBeUndefined();
    expect(todo.title).toBe('아침 스트레칭');
  });

  it('fields 의 id 가 생성된 id 를 덮어쓴다(Settings 의 고정 id)', () => {
    expect(createMeta<Todo>(deps, { ...FIELDS, id: 'default' }).id).toBe('default');
  });
});

describe('touch', () => {
  it('rev 를 정확히 1 올리고 updatedAt 을 주입한 시각으로 바꾼다', () => {
    const touched = touch(makePlainTodo(), T1);

    expect(touched.rev).toBe(2);
    expect(touched.updatedAt).toBe(T1);
  });

  it('createdAt 과 도메인 필드는 그대로 둔다', () => {
    const touched = touch(makePlainTodo(), T1);

    expect(touched.createdAt).toBe(T0);
    expect(touched.title).toBe('아침 스트레칭');
    expect(touched.done).toBe(false);
  });

  it('원본을 변경하지 않는다', () => {
    const todo = makePlainTodo();
    touch(todo, T1);

    expect(todo.rev).toBe(1);
    expect(todo.updatedAt).toBe(T0);
  });
});

describe('markDeleted', () => {
  it('deletedAt 을 설정하고 함께 touch 한다', () => {
    const deleted = markDeleted(makePlainTodo(), T1);

    expect(deleted.deletedAt).toBe(T1);
    expect(deleted.updatedAt).toBe(T1);
    expect(deleted.rev).toBe(2);
  });
});

describe('isTombstone', () => {
  it('deletedAt 이 있으면 툼스톤으로 판정한다', () => {
    expect(isTombstone(makePlainTodo())).toBe(false);
    expect(isTombstone(markDeleted(makePlainTodo(), T1))).toBe(true);
  });
});

describe('Persistable 브랜드', () => {
  it('도메인 함수를 거친 값만 upsert 에 넘길 수 있다', async () => {
    const plain = makePlainTodo();

    // @ts-expect-error 브랜드 없는 Todo 는 upsert 할 수 없다 (ADR-0007 규칙 3-d, TS2345)
    await noopRepository.upsert(plain);

    await expect(noopRepository.upsert(touch(plain, T1))).resolves.toBeUndefined();
    await expect(noopRepository.upsert(markDeleted(plain, T1))).resolves.toBeUndefined();
  });
});

describe('Persistable 브랜드 위조 시도', () => {
  // 아래 위조 시도는 전부 "브랜드 없는 값에 브랜드를 옮겨 붙이는" 경로다. 브랜드가 `true` 이던 시절에는
  // 13종 중 6종이 tsc·eslint 를 모두 통과했다(리뷰 라운드 1). 지금은 타입(여기) + 린트(eslint.config.mjs 의
  // NO_OBJECT_MUTATE·NO_NEVER_CAST, 픽스처는 scripts/check-arch.sh)가 나눠 막는다.
  // 이 파일은 테스트 계층이라 린트 규칙이 꺼져 있으므로 여기서 고정하는 것은 **타입 판정**뿐이다.
  const merge = <A, B>(a: A, b: B): A & B => ({ ...a, ...b });
  const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const bare = createMeta(deps, {});

  it('Object.assign 으로 만든 교차 타입은 다른 엔티티의 Persistable 이 아니다', () => {
    // @ts-expect-error 브랜드가 Meta 라서 Persistable<Todo> 가 아니다 (TS2345)
    const forged: Persistable<Todo> = Object.assign(bare, makePlainTodo());

    expect(forged.rev).toBe(1);
  });

  it('스프레드 조합·제네릭 병합 헬퍼·satisfies 도 브랜드를 옮기지 못한다', () => {
    // @ts-expect-error 스프레드 조합
    const bySpread: Persistable<Todo> = { ...bare, ...makePlainTodo() };
    // @ts-expect-error 제네릭 병합 헬퍼 경유
    const byHelper: Persistable<Todo> = merge(bare, makePlainTodo());
    const satisfied = { ...bare, ...makePlainTodo() } satisfies Todo;
    // @ts-expect-error satisfies 는 브랜드를 붙이지 않는다
    const bySatisfies: Persistable<Todo> = satisfied;

    expect([bySpread, byHelper, bySatisfies]).toHaveLength(3);
  });

  it('structuredClone·JSON 왕복·배열 map 경유도 마찬가지다', () => {
    // @ts-expect-error structuredClone 은 인자의 타입을 그대로 돌려준다
    const byClone: Persistable<Todo> = structuredClone(Object.assign(bare, makePlainTodo()));
    // @ts-expect-error JSON 왕복(제네릭 헬퍼) 경유
    const byJson: Persistable<Todo> = roundTrip(Object.assign(bare, makePlainTodo()));
    // @ts-expect-error 배열 map 경유
    const byMap: Persistable<Todo>[] = [makePlainTodo()].map((t) => Object.assign(bare, t));

    expect([byClone, byJson, byMap]).toHaveLength(3);
  });

  it('브랜드가 붙은 값은 그대로 저장할 수 있다(음성 대조 — 위 규칙이 정당한 코드를 막지 않는다)', async () => {
    const plain = makePlainTodo();

    await expect(noopRepository.upsert(createMeta<Todo>(deps, FIELDS))).resolves.toBeUndefined();
    await expect(noopRepository.upsert(touch(plain, T1))).resolves.toBeUndefined();
    await expect(noopRepository.upsert(markDeleted(plain, T1))).resolves.toBeUndefined();
  });
});
