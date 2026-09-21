import { describe, expect, it } from 'vitest';

import { readRemoteRow } from '@/domain/sync/remote-rows';
import type { SyncTable } from '@/domain/sync/wire';
import { SYNC_TABLES } from '@/domain/sync/wire';

import { makeCategory } from '@/test/fixtures/category';
import { makeDday } from '@/test/fixtures/dday';
import { makeDiaryEntry } from '@/test/fixtures/diary';
import { makeFocusSession } from '@/test/fixtures/focus-session';
import { makeRoutine } from '@/test/fixtures/routine';
import { makeSettings } from '@/test/fixtures/settings';
import { makeTodo } from '@/test/fixtures/todo';

const VALID_ROW: Record<SyncTable, { id: string }> = {
  todos: makeTodo(),
  categories: makeCategory(),
  focusSessions: makeFocusSession(),
  settings: makeSettings(),
  ddays: makeDday(),
  diaryEntries: makeDiaryEntry(),
  routines: makeRoutine(),
};

describe('readRemoteRow — 7테이블 전수', () => {
  it('모든 SyncTable 에 대해 유효한 로우는(봉투 id === 본문 id) ok:true 로 검증을 통과한다', () => {
    for (const tbl of SYNC_TABLES) {
      const row = VALID_ROW[tbl];
      const result = readRemoteRow(tbl, row.id, row);
      expect(result.ok, `${tbl} 실패`).toBe(true);
    }
  });

  it('알려진 필드는 그대로 살아남는다(왕복 동일성)', () => {
    const todo = makeTodo({ title: '풀에서 온 투두' });
    const result = readRemoteRow('todos', todo.id, todo);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entity).toMatchObject({ id: todo.id, rev: todo.rev });
    }
  });
});

describe('readRemoteRow — 형식 오류는 그 로우만 invalid', () => {
  it('필수 필드가 빠지면 invalid 를 돌려주고 던지지 않는다', () => {
    const broken = { ...makeTodo() } as Record<string, unknown>;
    delete broken['title'];
    expect(readRemoteRow('todos', broken['id'] as string, broken)).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('완전히 다른 모양의 값(문자열)도 invalid 로 처리한다', () => {
    expect(readRemoteRow('categories', 'x', '아무 문자열')).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('meta 형식 위반(rev 가 0)도 invalid', () => {
    const broken = { ...makeTodo(), rev: 0 };
    expect(readRemoteRow('todos', broken.id, broken)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('readRemoteRow — 봉투 id 와 본문 id 대조 (§②-3)', () => {
  it('본문(value.id)이 봉투로 받은 id 와 다르면 invalid — 형식은 멀쩡해도 다른 로우를 가리킨다', () => {
    const todo = makeTodo();
    const differentId = '99999999-0000-4000-8000-000000000099';
    expect(differentId).not.toBe(todo.id);
    expect(readRemoteRow('todos', differentId, todo)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('id 가 일치하면 정상 통과한다(대조 회귀 방지)', () => {
    const todo = makeTodo();
    expect(readRemoteRow('todos', todo.id, todo).ok).toBe(true);
  });
});
