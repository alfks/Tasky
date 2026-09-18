'use client';

import { useRef } from 'react';

import type { CategoryStatus } from '@/domain/category/category';
import { CATEGORY_NAME_MAX_LENGTH } from '@/domain/category/category.rules';
import { CATEGORY_EMOJIS } from '@/domain/theme/emoji';
import { DEFAULT_ACCENT_COLOR, PALETTE } from '@/domain/theme/palette';

import { useCategoryActions } from '@/features/category/hooks/useCategoryActions';
import { useCategoryForm, type CategoryFormMode } from '@/features/category/hooks/useCategoryForm';

import { Button } from '@/components/ui/Button';
import { ColorSwatchGroup } from '@/components/ui/ColorSwatchGroup';
import { Dialog } from '@/components/ui/Dialog';
import { EmojiPicker } from '@/components/ui/EmojiPicker';

/** 색 선택지 = 팔레트 12색. 저장값(라이트 HEX)을 그대로 라디오 값으로 쓴다 (R3). */
const COLOR_OPTIONS = PALETTE.map((preset) => ({
  id: preset.light,
  name: preset.name,
  color: preset.light,
}));

type CategoryFormDialogProps = {
  /** 열림 여부. 호출자는 열 때마다 `key` 를 바꿔 폼 초기값이 다시 잡히게 한다. */
  open: boolean;
  /** 만들기 / 수정. 수정이면 대상 카테고리가 초기값이다. */
  mode: CategoryFormMode;
  /** 닫아야 할 때(Esc·✕·바깥 클릭·취소·저장 성공). */
  onClose: () => void;
  /** 연 요소가 사라졌을 때의 대체 포커스 대상 (app-shell R14). */
  returnFocus?: () => HTMLElement | null;
};

/**
 * 카테고리 생성/수정 다이얼로그 (category §2-B, R1~R7·R9).
 *
 * Enter·Esc·포커스 트랩·IME 조합 규칙은 전부 `Dialog` 가 맡는다(app-shell R14). 특히 **조합 중 Enter 는
 * `Dialog` 가 문서 캡처 단계에서 삼키므로** 여기 `onKeyDown` 까지 오지 않는다 — 한글 이름을 확정하는
 * Enter 한 번이 "만들기"를 누르는 사고가 구조적으로 막힌다. 같은 판정을 여기서 다시 구현하지 않는다.
 */
export function CategoryFormDialog({ open, mode, onClose, returnFocus }: CategoryFormDialogProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const form = useCategoryForm(mode, DEFAULT_ACCENT_COLOR);
  const editing = mode.kind === 'edit' ? mode.category : undefined;

  const save = async (): Promise<void> => {
    if (await form.submit()) {
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing === undefined ? '카테고리 만들기' : '카테고리 수정'}
      initialFocusRef={nameRef}
      returnFocus={returnFocus}
      className="max-w-[400px]"
      footer={
        <>
          {editing === undefined ? null : (
            <StatusButtons
              status={editing.status}
              categoryId={editing.id}
              onDone={onClose}
              disabled={form.saving}
            />
          )}
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void save()} loading={form.saving}>
            {editing === undefined ? '만들기' : '저장'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[var(--space-4)]">
        <label className="flex flex-col gap-[var(--space-1)] text-sm text-muted">
          이름
          <input
            ref={nameRef}
            value={form.name}
            onChange={(e) => form.setName(e.target.value)}
            maxLength={CATEGORY_NAME_MAX_LENGTH * 2}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void save();
              }
            }}
            className="h-[var(--control-height)] w-full rounded-[var(--radius-md)] border border-border bg-surface px-[var(--space-3)] text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
        </label>

        {/*
          이모지는 **제공 목록에서 고른다**(T-70). 자유 입력이던 시절에는 이모지가 아닌 글자·여러
          글자가 그대로 들어왔다 — 색을 12개로 좁힌 것과 같은 이유로 집합을 좁혔다(§2-B·R4).
          Enter 는 여전히 이름 입력의 `onKeyDown` 만 제출로 읽는다: 여기 칸은 `button` 이라 Enter 가
          "그 이모지를 고르기" 로 끝나고 다이얼로그를 제출하지 않는다(category §5 와 같은 결론,
          이제는 입력이 아니라 **역할**이 그것을 보장한다).
        */}
        <div className="flex flex-col gap-[var(--space-2)]">
          <span className="text-sm text-muted">이모지</span>
          <EmojiPicker
            label="이모지"
            options={CATEGORY_EMOJIS}
            value={form.emoji}
            onChange={form.setEmoji}
          />
        </div>

        <div className="flex flex-col gap-[var(--space-2)]">
          <span className="text-sm text-muted">색상</span>
          <ColorSwatchGroup
            label="카테고리 색"
            options={COLOR_OPTIONS}
            value={form.color}
            onChange={form.setColor}
          />
        </div>

        <p className="flex items-center gap-[var(--space-2)] text-base text-text">
          <span className="text-sm text-muted">미리보기</span>
          <span
            aria-hidden="true"
            style={{ backgroundColor: form.color }}
            className="inline-block size-[12px] shrink-0 rounded-full"
          />
          <span>{form.emoji}</span>
          <span className="font-semibold">{form.name}</span>
        </p>

        {form.error === null ? null : (
          <p
            role="alert"
            // 위험 색 글자는 본문 대비 4.5:1 에 못 미치므로 --color-text 를 섞는다(theme.md R9·R2 방식).
            style={{ color: 'color-mix(in srgb, var(--color-danger) 70%, var(--color-text))' }}
            className="text-sm"
          >
            {form.error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/**
 * 수정 모드 하단 좌측: 활성이면 종료 두 갈래, 종료 상태면 재개 (§2-B "종료 상태면 [재개]", R7·R9).
 *
 * **종료 분기는 지금 사이드바에서 열리지 않는다**: 종료된 행의 `⋯` 는 §2-A 대로 재개 · 상태 바꾸기 ·
 * 삭제만 주고 수정을 주지 않기 때문이다(그쪽이 한 번에 끝나 더 짧다). 그래도 분기를 남기는 이유는
 * §2-B 가 수정 다이얼로그의 모습을 그렇게 규정했고, 셸(T-20)·팔레트가 카테고리 id 로 수정 다이얼로그를
 * 여는 경로를 붙이면 종료 카테고리가 그대로 들어오기 때문이다. 아래 테스트도 그 진입 경로를 흉내 낸
 * 것이지 사이드바에서 재현되는 시나리오가 아니다.
 */
function StatusButtons({
  status,
  categoryId,
  onDone,
  disabled,
}: {
  status: CategoryStatus;
  categoryId: string;
  onDone: () => void;
  disabled: boolean;
}) {
  const { setStatus } = useCategoryActions();
  const apply = async (next: CategoryStatus): Promise<void> => {
    if (await setStatus(categoryId, next)) {
      onDone();
    }
  };

  return (
    <div className="mr-auto flex gap-[var(--space-2)]">
      {status === 'active' ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => void apply('completed')}
          >
            완료로 종료
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => void apply('paused')}
          >
            중단으로 종료
          </Button>
        </>
      ) : (
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => void apply('active')}>
          재개
        </Button>
      )}
    </div>
  );
}
