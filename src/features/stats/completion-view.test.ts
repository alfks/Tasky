// 달성률 화면 모델 — completion-rate.md R1~R4 와 §5 문구.
//
// 픽스처를 일부러 비대칭으로 둔다(1/3·2/2·0/1·1/2·3/4): 양쪽에 같은 수를 넣으면 done 과 total 을
// 맞바꿔도, 순서를 뒤집어도 같은 값이 나와 테스트가 아무것도 검사하지 않는다.
import { describe, expect, it } from 'vitest';

import type { Todo } from '@/domain/todo/todo';

import {
  EMPTY_RING_LABEL,
  completionAnnouncement,
  completionCountText,
  completionPercentText,
  completionRingLabel,
  summarizeCompletion,
} from '@/features/stats/completion-view';
import { makeTodo } from '@/test/fixtures/todo';

/** `done` 개 완료 + `total - done` 개 미완료. seq 로 id 가 갈려 같은 카테고리에 겹치지 않는다. */
function todosFor(categoryId: string, done: number, total: number, offset: number): Todo[] {
  return Array.from({ length: total }, (_, index) =>
    makeTodo({ seq: offset + index, categoryId, done: index < done }),
  );
}

describe('summarizeCompletion (R1~R3)', () => {
  it('투두가 0개면 비율도 퍼센트도 정의되지 않는다', () => {
    expect(summarizeCompletion([])).toEqual({ done: 0, total: 0, rate: null, percent: null });
  });

  it('3개 중 1개 완료는 반올림 전 비율과 33%를 함께 준다', () => {
    const summary = summarizeCompletion(todosFor('c', 1, 3, 1));

    expect(summary.done).toBe(1);
    expect(summary.total).toBe(3);
    expect(summary.rate).toBeCloseTo(1 / 3, 10);
    expect(summary.percent).toBe(33);
  });

  it('3개 중 2개 완료는 67%로 올린다', () => {
    expect(summarizeCompletion(todosFor('c', 2, 3, 1)).percent).toBe(67);
  });

  it('200개 중 199개는 반올림이 100이어도 99%로 내린다 (R2)', () => {
    const summary = summarizeCompletion(todosFor('c', 199, 200, 1));

    expect(summary.percent).toBe(99);
    expect(summary.rate).toBeCloseTo(0.995, 10);
  });

  it('전부 완료일 때만 100%다 (R2)', () => {
    expect(summarizeCompletion(todosFor('c', 200, 200, 1)).percent).toBe(100);
  });

  it('전부 미완료면 0%이고 비율은 0이다', () => {
    const summary = summarizeCompletion(todosFor('c', 0, 4, 1));

    expect(summary.percent).toBe(0);
    expect(summary.rate).toBe(0);
  });

  it('종료·삭제된 카테고리의 투두도 분모에 들어간다 (R1)', () => {
    const todos = [...todosFor('active-cat', 1, 3, 1), ...todosFor('deleted-cat', 0, 2, 10)];

    expect(summarizeCompletion(todos)).toMatchObject({ done: 1, total: 5, percent: 20 });
  });
});

describe('표시 문구 (§5)', () => {
  it('링 문구에 퍼센트와 완료/전체가 모두 들어간다', () => {
    const summary = summarizeCompletion(todosFor('c', 1, 3, 1));

    expect(completionRingLabel(summary)).toBe('오늘 달성률 33퍼센트, 3개 중 1개 완료');
  });

  it('투두가 없으면 링 문구는 "오늘 할 일 없음"이다', () => {
    expect(completionRingLabel(summarizeCompletion([]))).toBe(EMPTY_RING_LABEL);
  });

  it('비율이 없으면 퍼센트 자리는 —, 개수 자리는 0 / 0이다', () => {
    const summary = summarizeCompletion([]);

    expect(completionPercentText(summary)).toBe('—');
    expect(completionCountText(summary)).toBe('0 / 0');
  });

  it('낭독 문구는 링 문구보다 짧은 "달성률 n%"다', () => {
    expect(completionAnnouncement(summarizeCompletion(todosFor('c', 2, 3, 1)))).toBe('달성률 67%');
  });

  it('100%일 때만 축하 문구를 함께 낭독한다 (R4)', () => {
    // 99% 와 100% 가 갈려야 한다 — 축하를 상수로 붙이거나 떼면 둘 중 하나가 깨진다.
    expect(completionAnnouncement(summarizeCompletion(todosFor('c', 3, 3, 1)))).toBe(
      '달성률 100%, 다 했어요',
    );
    expect(completionAnnouncement(summarizeCompletion(todosFor('c', 2, 3, 1)))).not.toContain(
      '다 했어요',
    );
  });
});
