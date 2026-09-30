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
  HistoryVisibilityOption,
  type RemovalChoiceKind,
} from '@/features/category/components/CategoryRemoveDialogChoices';
import {
  removalDescription,
  publicationRemovalNote,
  removalTitle,
} from '@/features/category/components/CategoryRemoveDialogText';
import { useActiveCategories } from '@/features/category/hooks/useCategories';
import { useCategoryPublication } from '@/features/category/hooks/useCategoryPublication';
import type {
  CategoryRemovalController,
  CategoryRemovalCounts,
} from '@/features/category/hooks/useCategoryRemoval';
import { messageOf } from '@/features/category/store/category-state';
import { useCategoryStore } from '@/features/category/store/category-store';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { OVERLAY_ALWAYS_LIVE_ATTR } from '@/components/ui/overlay-rules';
import { dismissToast, pushToast, useToasts } from '@/components/ui/Toast';

type CategoryRemoveDialogProps = {
  /** `useCategoryRemoval()` 의 반환값. `CategoryList` 의 `onRemove` 에는 `controller.requestRemove` 를 넘긴다. */
  controller: CategoryRemovalController;
  /** 연 요소가 삭제의 결과로 사라졌을 때의 대체 포커스 대상 (app-shell R14). */
  returnFocus?: () => HTMLElement | null;
};

/**
 * 제어기의 토스트 슬롯 하나를 **전역 허브의 토스트 한 장**과 짝지어 두고, 복귀 포커스를 감싼다 (T-30).
 *
 * 이 컴포넌트는 더 이상 자기 뷰포트를 띄우지 않는다(app-shell R8 — 뷰포트는 `ShellToasts` 하나).
 * 양방향으로 잇는다: 제어기에 토스트가 생기면 허브에 밀어 넣고, 허브에서 사라지면(6초 만료·다음
 * 토스트에 밀려남) 제어기의 되돌리기 창도 닫는다. 닫지 않으면 화면에 없는 `[되돌리기]` 의 메모가
 * 스토어에 남는다.
 *
 * **복귀 포커스를 왜 여기서 감싸나.** 파괴 확인이 닫힐 때 `Dialog` 는 열었던 요소가 사라졌으면
 * `returnFocus` 에 묻고, 셸의 답(`useRemovalReturnFocus`)은 "떠 있는 토스트의 액션 버튼이 첫 후보"
 * 다(T-20 리뷰 실측: `[되돌리기]` 까지 Tab 29회 / 토스트 수명 6,934ms). 그런데 허브를 거치면 토스트는
 * 대화상자가 사라진 **다음 커밋**에 뜬다 — React 는 한 커밋의 패시브 정리(=`Dialog` 의 복귀 처리)를
 * 그 커밋의 패시브 생성(=아래 push)보다 **먼저** 돌리므로 그 시점에는 버튼이 DOM 에 없다. 그래서
 * R14 순서로 먼저 보내고(포커스가 `<body>` 로 떨어지는 일은 없다), 토스트가 실제로 뜬 뒤 **그때까지
 * 아무도 포커스를 옮기지 않았을 때만** 옮긴다. 포커스가 들어가면 `Toast` 가 타이머를 멈추므로 6초
 * 제한도 함께 풀린다(R8).
 */
function useRemovalToastBridge(
  controller: CategoryRemovalController,
  returnFocus?: () => HTMLElement | null,
): () => HTMLElement | null {
  const { toast } = controller;
  const hubToasts = useToasts();
  const hubId = useRef<string | null>(null);
  const sourceId = useRef<string | null>(null);
  /** `Dialog` 에 돌려준 복귀 지점. 토스트가 뜰 때까지 여기 포커스가 남아 있으면 넘겨준다. */
  const handoffFrom = useRef<HTMLElement | null>(null);
  const latest = useRef({ dismissToast: controller.dismissToast, returnFocus });
  useEffect(() => {
    latest.current = { dismissToast: controller.dismissToast, returnFocus };
  });

  useEffect(() => {
    if (toast === null) {
      // 되돌리기에 성공하면 제어기가 슬롯을 비운다 — 화면의 토스트도 함께 걷는다.
      if (hubId.current !== null) dismissToast(hubId.current);
      hubId.current = null;
      sourceId.current = null;
      return;
    }
    if (sourceId.current === toast.id) return;
    sourceId.current = toast.id;
    const { id: _slotId, ...item } = toast;
    hubId.current = pushToast(item);
  }, [toast]);

  useEffect(() => {
    const id = hubId.current;
    if (id === null) return;
    if (!hubToasts.some((item) => item.id === id)) {
      hubId.current = null;
      handoffFrom.current = null;
      latest.current.dismissToast();
      return;
    }
    // 토스트가 이제 DOM 에 있다 — 기다리던 포커스를 넘긴다.
    const from = handoffFrom.current;
    if (from === null) return;
    handoffFrom.current = null;
    const active = document.activeElement;
    if (active !== from && active !== document.body) return;
    document.querySelector<HTMLButtonElement>(`[${OVERLAY_ALWAYS_LIVE_ATTR}] button`)?.focus();
  }, [hubToasts]);

  return () => {
    const fallback = latest.current.returnFocus?.() ?? toastPerch();
    handoffFrom.current = fallback;
    return fallback;
  };
}

/**
 * R14 순서가 아무 답도 내지 못했을 때 **토스트가 들어앉을 자리**를 임시 발판으로 내준다.
 *
 * 카테고리 행은 `⋯` 메뉴(포털)에서 지워지므로 자리표가 목록 밖을 가리켜 `null` 이 나오는 경로가
 * 실재한다(셸 테스트가 잡는다). 아무것도 돌려주지 않으면 포커스는 `<body>` 로 떨어지고 다음 Tab 이
 * 문서 맨 위로 튄다. 곧 여기에 토스트가 뜨고 위 효과가 `[되돌리기]` 로 옮겨 준다.
 *
 * 여기가 불리는 경로는 **연 요소가 사라졌을 때**뿐이고, 이 대화상자에서 그것은 곧 삭제가 끝났다는
 * 뜻이라 언제나 토스트(되돌리기 또는 실패)가 뒤따른다 — 취소·Esc 는 행이 살아 있어 이 자리에 오지
 * 않는다. 그래도 토스트가 오지 않는 날이 있다면 포커스는 빈 상주 영역에 남는다(`<body>` 보다 낫다).
 */
function toastPerch(): HTMLElement | null {
  const root = document.querySelector<HTMLElement>(`[${OVERLAY_ALWAYS_LIVE_ATTR}]`);
  if (root === null) return null;
  root.tabIndex = -1;
  return root;
}

/**
 * 카테고리 삭제 대화상자 + 되돌리기 토스트 (category §2-C, R10~R16).
 *
 * 다른 모달이 떠 있는 동안에도 토스트는 `data-overlay-always-live` 덕에 `inert` 를 비켜 가 AX 트리에
 * 남지만 **Tab 으로는 닿지 않는다**(`Dialog.trapTab` 의 순환 집합에 뷰포트가 없다) — 공용
 * 프리미티브를 고쳐야 하는 별도 티켓이다.
 *
 * N/M 을 세는 동안(`counts === null`)에는 아무것도 열지 않는다 — M 을 모르면 축약(R11)인지 3선택지인지
 * 정할 수 없고, 열어 두었다가 모양이 바뀌면 초기 포커스가 엉뚱한 곳에 남는다. 세기에 실패하면 훅이
 * 대상을 내리고 오류 토스트를 띄운다.
 */
export function CategoryRemoveDialog({ controller, returnFocus }: CategoryRemoveDialogProps) {
  const { target, counts } = controller;
  const returnFocusThenToast = useRemovalToastBridge(controller, returnFocus);

  if (target === null || counts === null) return null;
  return (
    <RemovalPrompt
      key={target.id}
      category={target}
      counts={counts}
      controller={controller}
      returnFocus={returnFocusThenToast}
    />
  );
}

type PromptProps = {
  category: Category;
  counts: CategoryRemovalCounts;
  controller: CategoryRemovalController;
  returnFocus?: () => HTMLElement | null;
};

/**
 * 대상마다 새로 마운트된다 — 폼 초기값을 effect 로 다시 넣지 않기 위해서다.
 *
 * 실제로 마운트를 보장하는 것은 위의 `counts === null` 이다: 대상이 바뀌면 개수를 다시 세는 동안
 * `counts` 가 `null` 이 되어 이 컴포넌트가 한 번 내려간다. `key={target.id}` 는 그 위에 덧댄 것이라,
 * 지워도 지금 화면은 달라지지 않는다(변이로 확인 — 테스트가 죽지 않는다). 그래도 남기는 이유는
 * "세는 동안 뼈대를 먼저 연다" 로 바꾸는 순간 `key` 가 유일한 방어가 되기 때문이다. 폼이 남으면
 * 지우려던 카테고리 A 에 쓰던 새 이름이 B 의 대화상자에 그대로 떠 있다.
 */
function RemovalPrompt({ category, counts, controller, returnFocus }: PromptProps) {
  const publication = useCategoryPublication();
  const targets = useActiveCategories().filter((other) => other.id !== category.id);
  const setStatus = useCategoryStore((state) => state.setStatus);
  const [kind, setKind] = useState<RemovalChoiceKind>(targets.length > 0 ? 'move' : 'create');
  const [targetId, setTargetId] = useState<CategoryId>(targets[0]?.id ?? '');
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_ACCENT_COLOR);
  const [hideHistory, setHideHistory] = useState(false);
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
    await controller.confirm(choice, hideHistory);
  };

  const submit = (): void => {
    const choice = buildChoice();
    if (choice !== null) {
      void remove(choice);
    }
  };

  const description = (
    <>
      {removalDescription(counts)}
      {publicationRemovalNote(category, publication.pendingCategoryIds)}
    </>
  );

  // R11 축약 — 미완료가 없으면 고를 것이 없다. 투두 삭제와 같은 공용 확인 대화상자를 쓴다.
  if (counts.incomplete === 0) {
    return (
      <ConfirmDialog
        open
        title={removalTitle(category.name)}
        description={
          <>
            {description}
            {counts.done === 0 ? null : (
              <div className="mt-[var(--space-3)]">
                <HistoryVisibilityOption checked={hideHistory} onChange={setHideHistory} />
              </div>
            )}
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
      {/* R22 — 남길 기록(N>0)이 있을 때만. 그 밖에는 지울 이름·색 자체가 없다. */}
      {counts.done === 0 ? null : (
        <div className="mt-[var(--space-4)]">
          <HistoryVisibilityOption checked={hideHistory} onChange={setHideHistory} />
        </div>
      )}
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
