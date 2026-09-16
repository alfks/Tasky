'use client';

import { useEffect, useRef, useState } from 'react';

import type { Category } from '@/domain/category/category';
import {
  assertCategoryCapacity,
  validateCategoryColor,
  validateCategoryName,
} from '@/domain/category/category.rules';
import type { CategoryRemovalChoice } from '@/domain/category/removal';
import { domainErrorMessage } from '@/domain/errors';
import type { CategoryId } from '@/domain/ids';
import { DEFAULT_ACCENT_COLOR } from '@/domain/theme/palette';

import {
  CategoryRemoveDialogChoices,
  type RemovalChoiceKind,
} from '@/features/category/components/CategoryRemoveDialogChoices';
import {
  removalDescription,
  removalTitle,
} from '@/features/category/components/CategoryRemoveDialogText';
import { useActiveCategories } from '@/features/category/hooks/useCategories';
import type {
  CategoryRemovalController,
  CategoryRemovalCounts,
} from '@/features/category/hooks/useCategoryRemoval';
import { messageOf } from '@/features/category/store/category-state';
import { useCategoryStore } from '@/features/category/store/category-store';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { ToastViewport, type ToastItem } from '@/components/ui/Toast';

/** 토스트가 없을 때도 라이브 영역은 떠 있어야 낭독된다 — 빈 배열의 참조를 고정해 둔다. */
const NO_TOASTS: readonly ToastItem[] = [];

type CategoryRemoveDialogProps = {
  /** `useCategoryRemoval()` 의 반환값. `CategoryList` 의 `onRemove` 에는 `controller.requestRemove` 를 넘긴다. */
  controller: CategoryRemovalController;
  /** 연 요소가 삭제의 결과로 사라졌을 때의 대체 포커스 대상 (app-shell R14). */
  returnFocus?: () => HTMLElement | null;
};

/**
 * 카테고리 삭제 대화상자 + 되돌리기 토스트 (category §2-C, R10~R16).
 *
 * **토스트 뷰포트가 이 컴포넌트에 함께 있는 이유**: 되돌리기 토스트는 대화상자가 닫힌 **뒤에** 뜬다.
 * 대화상자 안에 두면 같이 사라진다. 뷰포트는 `data-overlay-always-live` 를 달고 있어 모달이 배경을
 * `inert` 로 덮어도 [되돌리기] 에 Tab 으로 닿는다(overlay-rules).
 *
 * N/M 을 세는 동안(`counts === null`)에는 아무것도 열지 않는다 — M 을 모르면 축약(R11)인지 3선택지인지
 * 정할 수 없고, 열어 두었다가 모양이 바뀌면 초기 포커스가 엉뚱한 곳에 남는다. 세기에 실패하면 훅이
 * 대상을 내리고 오류 토스트를 띄운다.
 */
export function CategoryRemoveDialog({ controller, returnFocus }: CategoryRemoveDialogProps) {
  const { target, counts, toast } = controller;

  return (
    <>
      {target === null || counts === null ? null : (
        <RemovalPrompt
          key={target.id}
          category={target}
          counts={counts}
          controller={controller}
          returnFocus={returnFocus}
        />
      )}
      <ToastViewport
        toasts={toast === null ? NO_TOASTS : [toast]}
        onClose={controller.dismissToast}
      />
    </>
  );
}

type PromptProps = {
  category: Category;
  counts: CategoryRemovalCounts;
  controller: CategoryRemovalController;
  returnFocus?: () => HTMLElement | null;
};

/** 대상마다 새로 마운트된다(`key`) — 폼 초기값을 effect 로 다시 넣지 않기 위해서다. */
function RemovalPrompt({ category, counts, controller, returnFocus }: PromptProps) {
  const targets = useActiveCategories().filter((other) => other.id !== category.id);
  const setStatus = useCategoryStore((state) => state.setStatus);
  const [kind, setKind] = useState<RemovalChoiceKind>(targets.length > 0 ? 'move' : 'create');
  const [targetId, setTargetId] = useState<CategoryId>(targets[0]?.id ?? '');
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_ACCENT_COLOR);
  const [invalid, setInvalid] = useState<string | null>(null);
  const defaultRadioRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);

  // ②를 고르면 이름 입력으로 포커스가 옮겨 간다(§5). 첫 렌더는 건너뛴다 — 열릴 때의 초기 포커스는
  // 기본 선택 라디오이고, 대상이 없어 기본값이 ②일 때도 그 규칙이 먼저다.
  useEffect(() => {
    if (mounted.current && kind === 'create') {
      nameRef.current?.focus();
    }
    mounted.current = true;
  }, [kind]);

  /** 화면 값 → 도메인 선택지. 검증(R12)은 생성 다이얼로그와 **같은 함수**를 같은 순서로 부른다. */
  const buildChoice = (): CategoryRemovalChoice | null => {
    if (kind === 'delete') {
      return { incomplete: 'delete' };
    }
    if (kind === 'move') {
      if (targetId === '') {
        setInvalid(domainErrorMessage('CATEGORY_REMOVAL_TARGET_INVALID'));
        return null;
      }
      return { incomplete: 'move', targetId };
    }
    const existing = Object.values(useCategoryStore.getState().byId);
    try {
      assertCategoryCapacity(existing);
      return {
        incomplete: 'create',
        name: validateCategoryName(name, existing),
        color: validateCategoryColor(color),
      };
    } catch (thrown) {
      setInvalid(messageOf(thrown));
      return null;
    }
  };

  const remove = async (choice: CategoryRemovalChoice): Promise<void> => {
    setInvalid(null);
    await controller.confirm(choice);
  };

  const submit = (): void => {
    const choice = buildChoice();
    if (choice !== null) {
      void remove(choice);
    }
  };

  const description = removalDescription(counts);

  // R11 축약 — 미완료가 없으면 고를 것이 없다. 투두 삭제와 같은 공용 확인 대화상자를 쓴다.
  if (counts.incomplete === 0) {
    return (
      <ConfirmDialog
        open
        title={removalTitle(category.name)}
        description={
          <>
            {description}
            {controller.error === null ? null : <AlertLine>{controller.error}</AlertLine>}
          </>
        }
        onConfirm={() => void remove({ incomplete: 'delete' })}
        onCancel={controller.cancel}
        returnFocus={returnFocus}
      />
    );
  }

  return (
    <Dialog
      open
      onClose={controller.cancel}
      role="alertdialog"
      title={removalTitle(category.name)}
      description={description}
      initialFocusRef={defaultRadioRef}
      returnFocus={returnFocus}
      footer={
        <>
          <Button variant="outline" onClick={controller.cancel}>
            취소
          </Button>
          <Button variant="danger" onClick={submit} loading={controller.removing}>
            삭제
          </Button>
        </>
      }
    >
      <CategoryRemoveDialogChoices
        targets={targets}
        incompleteCount={counts.incomplete}
        kind={kind}
        onKindChange={(next) => {
          setInvalid(null);
          setKind(next);
        }}
        targetId={targetId}
        onTargetIdChange={(id) => {
          setInvalid(null);
          setTargetId(id);
          setKind('move');
        }}
        name={name}
        onNameChange={setName}
        color={color}
        onColorChange={setColor}
        defaultRadioRef={defaultRadioRef}
        nameRef={nameRef}
        error={invalid ?? controller.error}
      />
      {/* R16 종료 제안 — 남길 기록(N>0)이 있을 때만. 그 밖에는 소음이라 숨긴다. */}
      {counts.done === 0 ? null : (
        <p className="mt-[var(--space-4)] flex items-center gap-[var(--space-2)] text-sm text-muted">
          💡 기록만 정리하려면 삭제 대신
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              controller.cancel();
              void setStatus(category.id, 'completed');
            }}
          >
            완료로 종료
          </Button>
        </p>
      )}
    </Dialog>
  );
}

/** 축약형에서 실패 문구를 본문에 얹는다 (§2-D 삭제 실패 → 대화상자 유지 + 같은 문구). */
function AlertLine({ children }: { children: string }) {
  return (
    <span
      role="alert"
      // 위험 색 글자는 본문 대비 4.5:1 에 못 미치므로 --color-text 를 섞는다(theme.md R9·R2 방식).
      style={{ color: 'color-mix(in srgb, var(--color-danger) 70%, var(--color-text))' }}
      className="mt-[var(--space-2)] block text-sm"
    >
      {children}
    </span>
  );
}
