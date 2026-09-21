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

const VALID_ROW: Record<SyncTable, unknown> = {
  todos: makeTodo(),
  categories: makeCategory(),
  focusSessions: makeFocusSession(),
  settings: makeSettings(),
  ddays: makeDday(),
  diaryEntries: makeDiaryEntry(),
  routines: makeRoutine(),
};

describe('readRemoteRow — 7테이블 전수', () => {
  it('모든 SyncTable 에 대해 유효한 로우는 ok:true 로 검증을 통과한다', () => {
    for (const tbl of SYNC_TABLES) {
      const result = readRemoteRow(tbl, VALID_ROW[tbl]);
      expect(result.ok, `${tbl} 실패`).toBe(true);
    }
  });

  it('알려진 필드는 그대로 살아남는다(왕복 동일성)', () => {
    const todo = makeTodo({ title: '풀에서 온 투두' });
    const result = readRemoteRow('todos', todo);
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
    expect(readRemoteRow('todos', broken)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('완전히 다른 모양의 값(문자열)도 invalid 로 처리한다', () => {
    expect(readRemoteRow('categories', '아무 문자열')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('meta 형식 위반(rev 가 0)도 invalid', () => {
    const broken = { ...makeTodo(), rev: 0 };
    expect(readRemoteRow('todos', broken)).toEqual({ ok: false, reason: 'invalid' });
  });
});
