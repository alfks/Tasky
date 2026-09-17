// R8 불변식 — 달성률의 두 진입점이 같은 목록을 같은 방식으로 센다 (completion-rate.md R8).
//
// 이 파일이 있는 이유: 헤더 링·탭 제목은 `completionCounts`(하루치)를, 날짜 스트립 ✓ 배지는
// `summarizeDays`(날짜 범위)를 부른다. 값이 같은 것은 우연이 아니라 `summarizeDay` 가 세는 일을
// `completionCounts` 에 위임하기 때문이고, **그 위임이 풀리면 여기서 죽는다.** 각 함수의 개별
// 규칙(R1~R5·R7)은 `completion-rate.test.ts`·`day-summary.test.ts` 가 따로 본다.
import { describe, expect, it } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';
import { markDeleted } from '@/domain/meta';
import { completionCounts, completionPercent, completionRate } from '@/domain/todo/completion-rate';
import { summarizeDays } from '@/domain/todo/day-summary';
import type { Todo } from '@/domain/todo/todo';

import { makeCategories, makeCategory } from '@/test/fixtures/category';
import { makeTodo } from '@/test/fixtures/todo';

/** 2026-09-17 은 목요일. 도메인은 @/lib/date 를 import 하지 않으므로 주 7일을 문자열로 고정한다. */
const WEEK: DateKey[] = [
  '2026-09-14',
  '2026-09-15',
  '2026-09-16',
  '2026-09-17',
  '2026-09-18',
  '2026-09-19',
  '2026-09-20',
];
const DAY: DateKey = '2026-09-17';
const DELETED_AT = '2026-09-10T00:00:00.000Z';

/**
 * 같은 투두 목록을 두 경로에 넣고 결과를 맞춰 본다 — 이 티켓의 핵심 단언이다.
 *
 * 경로 A: `completionCounts`(+`completionRate`·`completionPercent`) — 헤더 링·탭 제목.
 * 경로 B: `summarizeDays` 의 `{ total, doneCount, isAllDone }` — 날짜 스트립 ✓ 배지.
 *
 * B 는 주 전체를 한 번에 돌므로 `days` 의 **모든 날짜**를 검사한다. 한 날만 보면 범위 버킷팅이
 * 어긋나도(투두가 옆 날짜로 새도) 통과할 수 있다.
 */
function expectPathsAgree(todos: readonly Todo[], categories: readonly Category[]): void {
  const summaries = summarizeDays(WEEK, todos, categories);
  for (const day of WEEK) {
    const ofDay = todos.filter((todo) => todo.date === day);
    const counts = completionCounts(ofDay);
    const summary = summaries.get(day);
    if (summary === undefined) throw new Error(`요약 없음: ${day}`);
    expect({ total: summary.total, doneCount: summary.doneCount }).toEqual({
      total: counts.total,
      doneCount: counts.done,
    });
    // ✓ 배지(date-strip R8)와 100%(R2·R4)는 같은 순간이어야 한다 — 0개면 양쪽 다 아니다.
    expect(summary.isAllDone).toBe(completionRate(ofDay) === 1);
    expect(summary.isAllDone).toBe(completionPercent(ofDay) === 100);
  }
}

/** `done` 개만 완료된 투두 `total` 건. 카테고리는 기본 픽스처 하나. */
function todosWithDone(total: number, done: number, date: DateKey = DAY): Todo[] {
  return Array.from({ length: total }, (_, i) => makeTodo({ seq: i + 1, date, done: i < done }));
}

describe('R8. 헤더 링·탭 제목과 날짜 스트립 ✓ 배지는 같은 목록을 같은 방식으로 센다', () => {
  it('투두 0개: 양쪽 다 0/0 이고 ✓ 배지도 100% 도 아니다', () => {
    expectPathsAgree([], makeCategories(2));
  });

  it('전부 완료: 양쪽 다 total === doneCount 이고 ✓ 배지가 켜진다', () => {
    const todos = todosWithDone(3, 3);
    expectPathsAgree(todos, [makeCategory()]);
    const summary = summarizeDays(WEEK, todos, [makeCategory()]).get(DAY);
    expect(summary?.isAllDone).toBe(true);
  });

  it('일부 완료: 양쪽 다 2/3 이고 ✓ 배지가 꺼진다', () => {
    const todos = todosWithDone(3, 2);
    expectPathsAgree(todos, [makeCategory()]);
    const summary = summarizeDays(WEEK, todos, [makeCategory()]).get(DAY);
    expect([summary?.doneCount, summary?.total, summary?.isAllDone]).toEqual([2, 3, false]);
  });

  it('전부 미완료: 양쪽 다 0/3 이다', () => {
    expectPathsAgree(todosWithDone(3, 0), [makeCategory()]);
  });

  it('0..n 완료 개수 전부에서 두 경로가 일치한다', () => {
    const categories = makeCategories(2);
    for (let total = 0; total <= 5; total += 1) {
      for (let done = 0; done <= total; done += 1) {
        expectPathsAgree(
          todosWithDone(total, done).map((todo, i) => ({
            ...todo,
            categoryId: categories[i % categories.length].id,
          })),
          categories,
        );
      }
    }
  });

  it('199/200 은 양쪽 다 ✓ 아님, 200/200 에서만 켜진다 (R2 경계)', () => {
    const categories = [makeCategory()];
    expectPathsAgree(todosWithDone(200, 199), categories);
    expectPathsAgree(todosWithDone(200, 200), categories);
    expect(summarizeDays(WEEK, todosWithDone(200, 199), categories).get(DAY)?.isAllDone).toBe(
      false,
    );
    expect(summarizeDays(WEEK, todosWithDone(200, 200), categories).get(DAY)?.isAllDone).toBe(true);
  });
});

describe('R8. 카테고리 상태와 무관하게 센다 — 점이 안 찍혀도 수는 그대로다 (R1)', () => {
  it('삭제된 카테고리의 투두가 섞여도(툼스톤을 색과 함께 받은 경우) 두 경로가 일치한다', () => {
    // `useWeekSummaries` 가 `listDeletedByIds`(ADR-0014)로 색을 찾아 온 경우다 — 점도 찍힌다.
    const active = makeCategory({ seq: 1 });
    const removed = markDeleted(makeCategory({ seq: 2 }), DELETED_AT);
    const todos = [
      makeTodo({ seq: 1, date: DAY, categoryId: active.id, done: true }),
      makeTodo({ seq: 2, date: DAY, categoryId: removed.id, done: true }),
      makeTodo({ seq: 3, date: DAY, categoryId: removed.id, done: false }),
    ];
    expectPathsAgree(todos, [active, removed]);
    const summary = summarizeDays(WEEK, todos, [active, removed]).get(DAY);
    expect([summary?.doneCount, summary?.total, summary?.dots.length]).toEqual([2, 3, 2]);
  });

  it('삭제 카테고리가 전부인 날도 전부 완료면 ✓ 배지가 켜진다', () => {
    const removed = markDeleted(makeCategory({ seq: 2 }), DELETED_AT);
    const todos = todosWithDone(2, 2).map((todo) => ({ ...todo, categoryId: removed.id }));
    expectPathsAgree(todos, [removed]);
    expect(summarizeDays(WEEK, todos, [removed]).get(DAY)?.isAllDone).toBe(true);
  });

  it('색을 끝내 못 찾은 카테고리 투두는 점이 없어도 수에서 빠지지 않는다', () => {
    // 조회표에 없는 id — 점도 넘침도 만들지 않지만 total·doneCount 에는 남는다(day-summary 주석).
    const active = makeCategory({ seq: 1 });
    const todos = [
      makeTodo({ seq: 1, date: DAY, categoryId: 'gone', done: true }),
      makeTodo({ seq: 2, date: DAY, categoryId: active.id, done: true }),
    ];
    expectPathsAgree(todos, [active]);
    const summary = summarizeDays(WEEK, todos, [active]).get(DAY);
    expect([summary?.total, summary?.doneCount, summary?.dots.length, summary?.isAllDone]).toEqual([
      2,
      2,
      1,
      true,
    ]);
  });

  it('종료된 카테고리의 투두도 양쪽에서 똑같이 센다', () => {
    const closed = makeCategory({
      seq: 2,
      status: 'completed',
      closedAt: '2026-09-12T00:00:00.000Z',
    });
    expectPathsAgree(
      todosWithDone(3, 1).map((todo) => ({ ...todo, categoryId: closed.id })),
      [makeCategory({ seq: 1 }), closed],
    );
  });
});

describe('R8. 날짜 범위 경로와 하루 경로가 날짜별로 어긋나지 않는다', () => {
  it('여러 날짜가 섞여도 날짜마다 두 경로가 일치한다', () => {
    const categories = makeCategories(2);
    const todos = [
      makeTodo({ seq: 1, date: '2026-09-14', categoryId: categories[0].id, done: true }),
      makeTodo({ seq: 2, date: '2026-09-14', categoryId: categories[1].id, done: true }),
      makeTodo({ seq: 3, date: DAY, categoryId: categories[0].id, done: true }),
      makeTodo({ seq: 4, date: DAY, categoryId: categories[1].id, done: false }),
      makeTodo({ seq: 5, date: '2026-09-20', categoryId: categories[0].id, done: false }),
    ];
    expectPathsAgree(todos, categories);
    const summaries = summarizeDays(WEEK, todos, categories);
    // 전부 완료인 날만 ✓ 가 켜진다 — 주 전체가 한 값으로 뭉개지지 않는다.
    expect(WEEK.map((day) => summaries.get(day)?.isAllDone)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('범위 밖 날짜의 투두는 어느 날짜의 수에도 들어가지 않는다', () => {
    const category = makeCategory();
    const todos = [
      makeTodo({ seq: 1, date: DAY, categoryId: category.id, done: true }),
      makeTodo({ seq: 2, date: '2026-10-01', categoryId: category.id, done: false }),
    ];
    expectPathsAgree(todos, [category]);
    expect(summarizeDays(WEEK, todos, [category]).get(DAY)?.isAllDone).toBe(true);
  });
});
