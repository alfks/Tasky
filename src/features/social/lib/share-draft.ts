import { parsePostInput } from '@/domain/social/input';
import type { PostInput } from '@/domain/social/social';
import type { Todo } from '@/domain/todo/todo';

/** 완료 기록의 공개 가능한 두 값만 별도 사본으로 떼어 낸다. */
export function copyCompletedTodo(todo: Todo): PostInput | null {
  if (!todo.done) return null;
  const parsed = parsePostInput({ text: todo.title, happenedOn: todo.date });
  return parsed.ok ? parsed.value : null;
}

/** 편집 후에도 서버가 허용한 두 필드만 보낸다. */
export function editShareDraft(text: string, happenedOn: string): PostInput | null {
  const parsed = parsePostInput({ text, happenedOn });
  return parsed.ok ? parsed.value : null;
}
