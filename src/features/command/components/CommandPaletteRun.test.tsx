import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TODO_HIGHLIGHT_MS,
  TODO_ROW_ATTR,
  goToTodo,
  highlightRow,
} from '@/features/command/components/CommandPaletteRun';
import { useDateStripStore } from '@/features/date-strip';
import { makeTodo } from '@/test/fixtures/todo';

const TODO = makeTodo({ seq: 1, title: '장보기', date: '2026-09-03' });

function makeRow(id: string): HTMLElement {
  const row = document.createElement('li');
  row.setAttribute(TODO_ROW_ATTR, id);
  row.tabIndex = -1;
  document.body.append(row);
  return row;
}

beforeEach(() => {
  useDateStripStore.setState({ selectedDate: '2026-09-17', today: '2026-09-17' });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('highlightRow (§2 하이라이트 400ms)', () => {
  it('포커스를 주고 400ms 뒤에 표시를 걷는다', () => {
    vi.useFakeTimers();
    const row = makeRow(TODO.id);
    highlightRow(row);
    expect(row).toHaveFocus();
    expect(row.style.outline).not.toBe('');

    vi.advanceTimersByTime(TODO_HIGHLIGHT_MS - 1);
    expect(row.style.outline).not.toBe('');
    vi.advanceTimersByTime(1);
    expect(row.style.outline).toBe('');
  });
});

describe('goToTodo (§2)', () => {
  it('날짜를 먼저 옮기고, 목록이 한참 뒤에 그려져도 그 행을 찾아 포커스한다', async () => {
    vi.useFakeTimers();
    const pending = goToTodo(TODO);
    // 날짜는 기다리지 않고 곧바로 바뀐다 — 목록이 다시 그려지는 계기가 이것이다.
    expect(useDateStripStore.getState().selectedDate).toBe('2026-09-03');
    expect(document.querySelector(`[${TODO_ROW_ATTR}]`)).toBeNull();

    // 한 번의 폴링으로는 못 만난다. 저장소 조회 + 리렌더가 그만큼 걸리는 것이 보통이다.
    await vi.advanceTimersByTimeAsync(400);
    const row = makeRow(TODO.id);
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    expect(row).toHaveFocus();
  });

  it('행이 끝내 나타나지 않아도 날짜 이동은 남고 조용히 포기한다', async () => {
    vi.useFakeTimers();
    const pending = goToTodo(TODO);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toBeUndefined();
    expect(useDateStripStore.getState().selectedDate).toBe('2026-09-03');
  });
});

describe('TODO_ROW_ATTR — 남의 feature 와의 DOM 계약', () => {
  /**
   * `@/features/todo` 배럴이 `FLIP_ATTR` 을 내보내지 않아 값을 복제했다(`CommandPaletteRun.tsx`).
   * import 로 묶으면 `command → todo → command` 순환이라 **파일을 읽어서** 대조한다 —
   * `src/test/tokens.test.ts` 가 `tokens.css` 를, 테마가 `index.html` 을 그렇게 대조하는 것과 같다.
   *
   * 이 가드가 없을 때 무슨 일이 났는지 리뷰어가 실측했다: `todo-focus.ts` 의 값을 바꿔도
   * `vitest run src` 1794건이 전부 초록이었고, 팔레트의 투두 점프만 **조용히** 포커스를 잃는다.
   * 배럴이 `FLIP_ATTR` 을 내보내면(T-34) 이 테스트와 복제 상수를 함께 지운다.
   */
  it('todo-focus.ts 의 FLIP_ATTR 과 같은 값이다', () => {
    const source = readFileSync('src/features/todo/components/todo-focus.ts', 'utf-8');
    const match = /export const FLIP_ATTR = '([^']+)'/.exec(source);
    expect(
      match,
      'todo-focus.ts 에서 FLIP_ATTR 선언을 찾지 못했습니다 — 정규식을 고치세요',
    ).not.toBeNull();
    expect(TODO_ROW_ATTR).toBe(match?.[1]);
  });
});
