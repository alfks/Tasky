import { describe, expect, it } from 'vitest';

import { copyCompletedTodo, editShareDraft } from '@/features/social/lib/share-draft';
import { makeTodo } from '@/test/fixtures/todo';

describe('공유용 사본', () => {
  it('완료 기록에서 제목·날짜만 복사하고 원본 메모·카테고리·ID를 빼낸다', () => {
    const original = makeTodo({ done: true, title: '달리기', memo: '공개하면 안 되는 메모' });
    expect(copyCompletedTodo(original)).toEqual({ text: '달리기', happenedOn: original.date });
    expect(JSON.stringify(copyCompletedTodo(original))).not.toContain(original.id);
    expect(JSON.stringify(copyCompletedTodo(original))).not.toContain(original.categoryId);
    expect(JSON.stringify(copyCompletedTodo(original))).not.toContain(original.memo);
  });

  it('완료하지 않은 기록과 비어 있는 수정문을 거절한다', () => {
    expect(copyCompletedTodo(makeTodo({ done: false }))).toBeNull();
    expect(editShareDraft(' ', '2026-09-28')).toBeNull();
  });
});
