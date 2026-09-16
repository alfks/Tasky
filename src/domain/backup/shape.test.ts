import { describe, expect, it } from 'vitest';

import {
  asArray,
  asRecord,
  assertMeta,
  isBackupShapeError,
  META_KEYS,
  pickFields,
  requireDateKey,
  requireNumber,
} from '@/domain/backup/shape';

import { makeTodo } from '@/test/fixtures/todo';

/** 실패의 경로를 꺼낸다. 던지지 않으면 테스트가 깨진다. */
function pathOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (isBackupShapeError(error)) {
      return error.path;
    }
    throw error;
  }
  throw new Error('던져야 한다');
}

describe('pickFields', () => {
  it('목록에 없는 필드를 버린다 (R5)', () => {
    const picked = pickFields({ a: 1, b: 2 }, ['a'], 'row');
    expect(picked).toEqual({ a: 1 });
  });

  it('없는 키는 담지 않아 선택 필드의 부재가 유지된다', () => {
    expect(pickFields({ a: 1 }, ['a', 'b'], 'row')).not.toHaveProperty('b');
  });

  it('키마다 정확히 한 번만 읽는다 — 값이 바뀌는 getter 도 스냅샷이 고정된다', () => {
    let calls = 0;
    const source = {};
    Object.defineProperty(source, 'a', {
      enumerable: true,
      get: () => {
        calls += 1;
        return calls;
      },
    });
    const picked = pickFields(source, ['a'], 'row');
    expect(picked['a']).toBe(1);
    expect(calls).toBe(1);
  });

  it('객체가 아니면 그 경로에서 실패한다', () => {
    expect(pathOf(() => pickFields(42, ['a'], 'todos[3]'))).toBe('todos[3]');
    expect(pathOf(() => pickFields(null, ['a'], 'settings'))).toBe('settings');
    expect(pathOf(() => pickFields([], ['a'], 'settings'))).toBe('settings');
  });
});

describe('asRecord · asArray', () => {
  it('배열은 객체가 아니다', () => {
    expect(pathOf(() => asRecord([], 'x'))).toBe('x');
  });

  it('객체는 배열이 아니다', () => {
    expect(pathOf(() => asArray({}, 'todos'))).toBe('todos');
    expect(asArray([1], 'todos')).toEqual([1]);
  });
});

describe('requireDateKey', () => {
  it.each(['2026-01-15', '2024-02-29'])('%s 는 실존하는 날짜다', (value) => {
    expect(requireDateKey({ date: value }, 'date', 'row')).toBe(value);
  });

  it.each(['2026/01/15', '2026-1-5', '2026-02-30', '2026-13-01', '2025-02-29', 42, null])(
    '%s 는 날짜 키가 아니다',
    (value) => {
      expect(pathOf(() => requireDateKey({ date: value }, 'date', 'row'))).toBe('row.date');
    },
  );
});

describe('requireNumber', () => {
  it('NaN·Infinity 는 수가 아니다', () => {
    expect(pathOf(() => requireNumber({ n: Number.NaN }, 'n', 'row'))).toBe('row.n');
    expect(pathOf(() => requireNumber({ n: Number.POSITIVE_INFINITY }, 'n', 'row'))).toBe('row.n');
  });

  it('integer·min 옵션이 범위를 좁힌다', () => {
    expect(pathOf(() => requireNumber({ n: 1.5 }, 'n', 'row', { integer: true }))).toBe('row.n');
    expect(pathOf(() => requireNumber({ n: -1 }, 'n', 'row', { min: 0 }))).toBe('row.n');
    expect(requireNumber({ n: 0 }, 'n', 'row', { integer: true, min: 0 })).toBe(0);
  });
});

describe('assertMeta', () => {
  it('정상 엔티티는 통과한다', () => {
    expect(() => assertMeta(makeTodo(), 'todos[0]')).not.toThrow();
  });

  it('실패한 필드 이름이 경로에 붙는다 — 값은 붙지 않는다', () => {
    const path = pathOf(() => assertMeta({ ...makeTodo(), id: '비밀-값' }, 'todos[0]'));
    expect(path).toBe('todos[0].id');
    expect(path).not.toContain('비밀');
  });

  it.each(META_KEYS.filter((key) => key !== 'deletedAt'))('%s 가 깨지면 그 경로다', (key) => {
    const broken = { ...makeTodo(), [key]: '!' };
    expect(pathOf(() => assertMeta(broken, 'todos[0]'))).toBe(`todos[0].${key}`);
  });

  it('Settings 의 고정 id 는 UUID 검사에서 제외된다', () => {
    expect(() => assertMeta({ ...makeTodo(), id: 'default' }, 'settings')).not.toThrow();
  });
});
