// 생성/수정 다이얼로그의 폼 상태 + 검증 (category.md R1~R6, §2-D 검증 오류).
//
// 검증은 **도메인 함수를 그대로** 부른다(`validateCategoryName`·`validateCategoryColor`·
// `validateCategoryEmoji`·`assertCategoryCapacity`) — 저장 직전 `createCategory`/`updateCategory` 가
// 부르는 것과 같은 함수다. 화면용으로 규칙을 다시 쓰면 인라인 문구와 저장 결과가 갈린다(R12 와 같은 이유).
// 순서도 도메인과 같다(개수 → 이름 → 색 → 이모지): 50개가 찬 상태에서는 이름을 고쳐도 저장되지 않으므로
// 그 사실을 먼저 알린다.
import { useState } from 'react';

import type { Category } from '@/domain/category/category';
import {
  assertCategoryCapacity,
  validateCategoryColor,
  validateCategoryEmoji,
  validateCategoryName,
} from '@/domain/category/category.rules';

import { useCategoryActions } from '@/features/category/hooks/useCategoryActions';
import { messageOf, SAVE_FAILED } from '@/features/category/store/category-state';
import { useCategoryStore } from '@/features/category/store/category-store';

/** 만들기 / 수정 — 수정이면 대상 카테고리가 초기값이자 유일성 검사의 예외(자기 자신)다. */
export type CategoryFormMode = { kind: 'create' } | { kind: 'edit'; category: Category };

/** 다이얼로그가 쓰는 폼 한 벌. */
export type CategoryForm = {
  name: string;
  setName: (value: string) => void;
  /** 저장값과 같은 표기(팔레트 12색의 라이트 HEX 대문자). */
  color: string;
  setColor: (value: string) => void;
  /** 빈 문자열은 "이모지 없음". */
  emoji: string;
  setEmoji: (value: string) => void;
  /** 검증 오류 또는 저장 실패 문구. 입력 아래 `role="alert"` 로 그린다. */
  error: string | null;
  /** 저장 중(중복 제출 방지). */
  saving: boolean;
  /** 검증 → 저장. 성공하면 `true` 이고 호출자가 다이얼로그를 닫는다. */
  submit: () => Promise<boolean>;
};

/** 폼 값 → 검증된 값. 규칙 위반이면 `DomainError` 를 던진다(문구가 그대로 화면에 간다). */
function validate(
  values: { name: string; color: string; emoji: string },
  mode: CategoryFormMode,
  existing: readonly Category[],
): { name: string; color: string; emoji: string | undefined } {
  if (mode.kind === 'create') {
    assertCategoryCapacity(existing);
  }
  const selfId = mode.kind === 'edit' ? mode.category.id : undefined;
  return {
    name: validateCategoryName(values.name, existing, selfId),
    color: validateCategoryColor(values.color),
    emoji: validateCategoryEmoji(values.emoji),
  };
}

/**
 * 다이얼로그가 열릴 때마다 **새로 마운트되는 것**을 전제로 한다(호출자가 `key` 로 보장) —
 * `useEffect` 로 초기값을 다시 넣지 않는다(code-style §3: useEffect 상태 동기화 금지).
 */
export function useCategoryForm(mode: CategoryFormMode, defaultColor: string): CategoryForm {
  const initial = mode.kind === 'edit' ? mode.category : undefined;
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? defaultColor);
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { createCategory, updateCategory } = useCategoryActions();

  const submit = async (): Promise<boolean> => {
    let checked: { name: string; color: string; emoji: string | undefined };
    try {
      checked = validate(
        { name, color, emoji },
        mode,
        Object.values(useCategoryStore.getState().byId),
      );
    } catch (thrown) {
      setError(messageOf(thrown));
      return false;
    }
    setSaving(true);
    const saved =
      mode.kind === 'create'
        ? await createCategory({ name: checked.name, color: checked.color, emoji: checked.emoji })
        : await updateCategory(mode.category.id, {
            name: checked.name,
            color: checked.color,
            // 빈 이모지는 "제거" 다 — `undefined` 는 "건드리지 않음" 이라 지울 수가 없다.
            emoji: checked.emoji ?? null,
          });
    setSaving(false);
    if (!saved) {
      setError(useCategoryStore.getState().error ?? SAVE_FAILED);
    }
    return saved;
  };

  return { name, setName, color, setColor, emoji, setEmoji, error, saving, submit };
}
