// 상태 순수 변환 테스트. 특히 `withCategories` 의 툼스톤 처리는 **T-12b 삭제 트랜잭션이 타는 경로**라
// 여기서 고정해 둔다(맵에 남으면 삭제한 카테고리가 사이드바에 계속 보인다).
import { describe, expect, it } from 'vitest';

import { DomainError } from '@/domain/errors';
import { markDeleted, touch } from '@/domain/meta';

import {
  indexCategories,
  messageOf,
  SAVE_FAILED,
  withCategories,
  withoutCategory,
} from '@/features/category/store/category-state';
import { makeCategory } from '@/test/fixtures/category';

const 공부 = makeCategory({ seq: 1, name: '공부', order: 0 });
const 운동 = makeCategory({ seq: 2, name: '운동', order: 1 });
const 독서 = makeCategory({ seq: 3, name: '독서', order: 2 });
const byId = indexCategories([공부, 운동, 독서]);

describe('withCategories', () => {
  it('덮어쓴 것만 바뀌고 나머지 참조는 그대로다', () => {
    const next = withCategories(byId, [
      touch({ ...운동, name: '달리기' }, '2026-02-01T00:00:00.000Z'),
    ]);

    expect(next[운동.id].name).toBe('달리기');
    expect(next[공부.id]).toBe(byId[공부.id]);
    expect(next[독서.id]).toBe(byId[독서.id]);
  });

  it('툼스톤은 덮어쓰지 않고 맵에서 내린다', () => {
    const next = withCategories(byId, [markDeleted(독서, '2026-02-01T00:00:00.000Z')]);

    expect(Object.keys(next)).toHaveLength(2);
    expect(next[독서.id]).toBeUndefined();
    expect(next[운동.id].name).toBe('운동');
  });
});

describe('withoutCategory', () => {
  it('한 건만 뺀다', () => {
    expect(Object.keys(withoutCategory(byId, 공부.id))).toEqual([운동.id, 독서.id]);
  });
});

describe('messageOf', () => {
  it('도메인 오류는 그 문구를, 그 밖은 공통 문구를 쓴다', () => {
    expect(messageOf(new DomainError('CATEGORY_NAME_DUPLICATE'))).toBe('같은 이름이 이미 있어요');
    expect(messageOf(new Error('boom'))).toBe(SAVE_FAILED);
  });
});
