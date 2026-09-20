// `readTodo` 의 `TODO_KEYS` 화이트리스트 회귀 테스트 (backup.md R4·R5) — routine.md §4 로
// `Todo.routineId?` 가 생기며 드러난 버그: 화이트리스트에 없는 필드는 `pickFields` 가 조용히 버린다
// (`shape.ts` 머리주석 "목록에 없는 필드는 여기서 사라진다"). `routineId` 를 `TODO_KEYS` 에 더하지
// 않으면 백업 내보내기 → 가져오기 왕복에서 루틴 연결이 조용히 사라진다.
import { describe, expect, it } from 'vitest';

import { readTodo } from '@/domain/backup/validate-rows';

import { makeTodo } from '@/test/fixtures/todo';

describe('readTodo — routineId 왕복 (routine.md §4)', () => {
  it('routineId 가 있는 투두는 readTodo 를 거쳐도 그대로 남는다(백업 왕복)', () => {
    const exported = makeTodo({ routineId: '70000000-0000-4000-8000-000000000001' });

    const restored = readTodo(exported, 'todos[0]');

    expect(restored.routineId).toBe('70000000-0000-4000-8000-000000000001');
  });

  it('routineId 가 없는 투두는(R21 즉시 등록·직접 추가) 필드 자체가 안 생긴다', () => {
    const exported = makeTodo();
    expect('routineId' in exported).toBe(false);

    const restored = readTodo(exported, 'todos[0]');

    expect('routineId' in restored).toBe(false);
  });

  it('화이트리스트 밖 필드(TODO_KEYS 에 없는 것)는 여전히 사라진다 (backup R5, 회귀 없음)', () => {
    const restored = readTodo({ ...makeTodo(), unknownField: '유출되면 안 됨' }, 'todos[0]');
    expect('unknownField' in restored).toBe(false);
  });
});
