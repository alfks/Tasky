import { describe, expect, it } from 'vitest';

import { FOCUS_SUMMARY_NONE_KEY, summarizeFocusSeconds } from '@/domain/todo/focus-summary';

import { makeFocusSession } from '@/test/fixtures/focus-session';

describe('summarizeFocusSeconds (stats.md R5)', () => {
  it('completed·canceled 세션만 더하고 running·paused 는 제외한다', () => {
    const sessions = [
      makeFocusSession({ seq: 1, date: '2026-09-18', status: 'completed', elapsedSeconds: 300 }),
      makeFocusSession({ seq: 2, date: '2026-09-18', status: 'canceled', elapsedSeconds: 60 }),
      makeFocusSession({ seq: 3, date: '2026-09-18', status: 'running', elapsedSeconds: 999 }),
      makeFocusSession({ seq: 4, date: '2026-09-18', status: 'paused', elapsedSeconds: 999 }),
    ];

    const totals = summarizeFocusSeconds(sessions, 'day');

    expect(totals.get('2026-09-18')).toBe(360);
  });

  it('day 기준은 날짜별로 더한다', () => {
    const sessions = [
      makeFocusSession({ seq: 1, date: '2026-09-18', status: 'completed', elapsedSeconds: 100 }),
      makeFocusSession({ seq: 2, date: '2026-09-19', status: 'completed', elapsedSeconds: 200 }),
    ];

    const totals = summarizeFocusSeconds(sessions, 'day');

    expect(totals.get('2026-09-18')).toBe(100);
    expect(totals.get('2026-09-19')).toBe(200);
  });

  it('todo 기준은 투두별로 더하고, todoId 가 없으면 공용 키로 모인다', () => {
    const sessions = [
      makeFocusSession({ seq: 1, todoId: 'todo-a', status: 'completed', elapsedSeconds: 100 }),
      makeFocusSession({ seq: 2, todoId: 'todo-a', status: 'completed', elapsedSeconds: 50 }),
      makeFocusSession({ seq: 3, status: 'completed', elapsedSeconds: 30 }),
    ];

    const totals = summarizeFocusSeconds(sessions, 'todo');

    expect(totals.get('todo-a')).toBe(150);
    expect(totals.get(FOCUS_SUMMARY_NONE_KEY)).toBe(30);
  });

  it('category 기준은 카테고리별로 더하고, categoryId 가 없으면 공용 키로 모인다', () => {
    const sessions = [
      makeFocusSession({
        seq: 1,
        categoryId: 'cat-a',
        status: 'completed',
        elapsedSeconds: 100,
      }),
      makeFocusSession({ seq: 2, status: 'canceled', elapsedSeconds: 20 }),
    ];

    const totals = summarizeFocusSeconds(sessions, 'category');

    expect(totals.get('cat-a')).toBe(100);
    expect(totals.get(FOCUS_SUMMARY_NONE_KEY)).toBe(20);
  });

  it('세션이 없으면 빈 Map 이다', () => {
    expect(summarizeFocusSeconds([], 'day').size).toBe(0);
  });
});
