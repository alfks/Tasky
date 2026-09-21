// `pick`·`withField` 런타임 모양 검증(리뷰 요청 — 타입이 맞다는 것으로 갈음하지 않는다). 이 둘은
// `no-restricted-syntax`(NO_META_WRITE)를 피해 `OutboxEntry`류 값 객체를 조립하는 유일한 통로다
// (`sync-repository.ts` 머리주석). `JSON.stringify` 라운드트립으로 **실제 키 집합과 값**을 덤프해
// 비교한다 — `toEqual` 만으로는 여분의 프로토타입 오염·열거 불가 필드를 놓칠 수 있어 키 배열도 따로 본다.
import { describe, expect, it } from 'vitest';

import { pick, withField } from '@/repositories/sync-repository';

describe('pick', () => {
  it('지정한 키만 옮긴다 — 여분 필드가 새지 않는다', () => {
    const source = { id: 'a', rev: 3, title: '제목', tbl: 'todos' as const };

    const result = pick(source, ['id', 'rev']);

    expect(Object.keys(result).sort()).toEqual(['id', 'rev']);
    expect(result).toEqual({ id: 'a', rev: 3 });
    expect(JSON.stringify(result)).toBe(JSON.stringify({ id: 'a', rev: 3 }));
  });

  it('원본을 변형하지 않는다', () => {
    const source = { id: 'a', rev: 3 };
    const result = pick(source, ['id']);
    result.id = 'changed';
    expect(source.id).toBe('a');
  });

  it('빈 키 목록이면 빈 객체다', () => {
    const source = { id: 'a', rev: 3 };
    expect(pick(source, [])).toEqual({});
  });
});

describe('withField', () => {
  it('계산된 키·값 하나짜리 객체를 만든다', () => {
    const result = withField('updatedAt', '2026-01-01T00:00:00.000Z');

    expect(Object.keys(result)).toEqual(['updatedAt']);
    expect(result.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(JSON.stringify(result)).toBe('{"updatedAt":"2026-01-01T00:00:00.000Z"}');
  });

  it('pick 과 스프레드로 합치면 전체 모양이 의도대로 나온다(OutboxEntry 재현)', () => {
    const entity = { id: 'todo-1', rev: 2, title: '무관한 필드' };
    const outboxEntry = { tbl: 'todos' as const, ...pick(entity, ['id', 'rev']) };

    expect(Object.keys(outboxEntry).sort()).toEqual(['id', 'rev', 'tbl']);
    expect(outboxEntry).toEqual({ tbl: 'todos', id: 'todo-1', rev: 2 });

    const serverChange = {
      tbl: 'todos' as const,
      id: 'todo-1',
      baseSeq: 2,
      ...withField('updatedAt', '2026-01-02T00:00:00.000Z'),
    };
    expect(Object.keys(serverChange).sort()).toEqual(['baseSeq', 'id', 'tbl', 'updatedAt']);
    expect(serverChange).toEqual({
      tbl: 'todos',
      id: 'todo-1',
      baseSeq: 2,
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });
});
