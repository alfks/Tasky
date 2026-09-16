'use client';

import { useId } from 'react';
import type { RefObject } from 'react';

import type { Category } from '@/domain/category/category';
import { CATEGORY_NAME_MAX_LENGTH } from '@/domain/category/category.rules';
import type { CategoryId } from '@/domain/ids';
import { PALETTE } from '@/domain/theme/palette';

import { ColorSwatchGroup } from '@/components/ui/ColorSwatchGroup';

/** 색 선택지 = 팔레트 12색. 저장값(라이트 HEX)을 그대로 라디오 값으로 쓴다 (R3 · R12 → R3). */
const COLOR_OPTIONS = PALETTE.map((preset) => ({
  id: preset.light,
  name: preset.name,
  color: preset.light,
}));

/** 미완료를 어떻게 할지 (R10). 도메인 `CategoryRemovalChoice.incomplete` 와 같은 세 갈래다. */
export type RemovalChoiceKind = 'move' | 'create' | 'delete';

type ChoicesProps = {
  /** 이동 대상 후보 = 자기 자신을 뺀 활성 카테고리, `order` 순 (R10 · R8). */
  targets: readonly Category[];
  /** M — ③ 을 고르면 사라질 개수. 무엇을 잃는지 숫자로 알린다. */
  incompleteCount: number;
  kind: RemovalChoiceKind;
  onKindChange: (kind: RemovalChoiceKind) => void;
  targetId: CategoryId;
  onTargetIdChange: (id: CategoryId) => void;
  name: string;
  onNameChange: (name: string) => void;
  color: string;
  onColorChange: (color: string) => void;
  /** 기본 선택 라디오 — 열릴 때 포커스를 받는다 (§5). */
  defaultRadioRef: RefObject<HTMLInputElement | null>;
  /** ② 이름 입력 — 라디오 ②를 고르면 포커스가 옮겨 온다 (§5). */
  nameRef: RefObject<HTMLInputElement | null>;
  /** 검증 오류·저장 실패 문구 (R12 · §2-D). 선택지 바로 아래 `role="alert"` 로 나온다. */
  error: string | null;
};

const RADIO_CLASS = 'size-[16px] shrink-0 accent-[var(--color-accent)]';
const ROW_CLASS = 'flex items-center gap-[var(--space-2)] text-base text-text';
const FIELD_CLASS =
  'h-[var(--control-height)] rounded-[var(--radius-md)] border border-border bg-surface px-[var(--space-2)] text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/**
 * 삭제 대화상자의 선택지 세 갈래 (category §2-C, R10~R12).
 *
 * 값은 전부 위에서 받는다 — ②의 이름·색은 다른 라디오로 바꿔도 **유지돼야** 하고(§5), 실행 직전
 * 검증(R12)도 위에서 하기 때문이다. 조합 중 Enter 는 `Dialog` 가 문서 캡처에서 삼키므로(app-shell R14)
 * 여기서 IME 판정을 다시 구현하지 않는다.
 */
export function CategoryRemoveDialogChoices({
  targets,
  incompleteCount,
  kind,
  onKindChange,
  targetId,
  onTargetIdChange,
  name,
  onNameChange,
  color,
  onColorChange,
  defaultRadioRef,
  nameRef,
  error,
}: ChoicesProps) {
  const group = useId();
  const moveHintId = `${group}-move-hint`;
  const deleteHintId = `${group}-delete-hint`;
  const noTargets = targets.length === 0;
  // 대상이 없으면 ①은 고를 수 없고 기본값은 ②다 — 그 판정은 화면이 한다(removal.ts 주석).
  const defaultKind: RemovalChoiceKind = noTargets ? 'create' : 'move';

  const radioProps = (option: RemovalChoiceKind) => ({
    type: 'radio' as const,
    name: group,
    className: RADIO_CLASS,
    checked: kind === option,
    onChange: () => onKindChange(option),
    ...(option === defaultKind ? { ref: defaultRadioRef } : {}),
  });

  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      <div
        role="radiogroup"
        aria-label="아직 안 한 할 일 처리"
        className="flex flex-col gap-[var(--space-3)]"
      >
        <div className="flex flex-col gap-[var(--space-2)]">
          <label className={ROW_CLASS}>
            <input {...radioProps('move')} disabled={noTargets} aria-describedby={moveHintId} />
            다른 카테고리로 옮기기
          </label>
          {/* 대상 select 는 ① 이 선택되지 않았을 때도 **비활성으로 두지 않는다** — 비활성 컨트롤은
              탭 순서와 낭독에서 빠져 "대상을 먼저 고르고 ①을 누르는" 순서가 막힌다. 대신 대상을
              고르면 호출자가 ①을 함께 선택한다. */}
          {noTargets ? (
            <span id={moveHintId} className="pl-[var(--space-5)] text-sm text-muted">
              옮길 카테고리가 없어요
            </span>
          ) : (
            <select
              id={moveHintId}
              aria-label="옮길 카테고리"
              value={targetId}
              onChange={(e) => onTargetIdChange(e.target.value)}
              className={`${FIELD_CLASS} ml-[var(--space-5)]`}
            >
              {targets.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.emoji === undefined
                    ? category.name
                    : `${category.emoji} ${category.name}`}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-col gap-[var(--space-2)]">
          <label className={ROW_CLASS}>
            <input {...radioProps('create')} />새 카테고리를 만들어 옮기기
          </label>
          {kind === 'create' ? (
            <div className="ml-[var(--space-5)] flex flex-col gap-[var(--space-3)]">
              <label className="flex flex-col gap-[var(--space-1)] text-sm text-muted">
                이름
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  maxLength={CATEGORY_NAME_MAX_LENGTH * 2}
                  className={FIELD_CLASS}
                />
              </label>
              <ColorSwatchGroup
                label="새 카테고리 색"
                options={COLOR_OPTIONS}
                value={color}
                onChange={onColorChange}
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-[var(--space-1)]">
          <label className={ROW_CLASS}>
            <input {...radioProps('delete')} aria-describedby={deleteHintId} />
            함께 삭제
          </label>
          <span id={deleteHintId} className="pl-[var(--space-5)] text-sm text-muted">
            아직 안 한 할 일 {incompleteCount}개가 사라져요
          </span>
        </div>
      </div>

      {error === null ? null : (
        <p
          role="alert"
          // 위험 색 글자는 본문 대비 4.5:1 에 못 미치므로 --color-text 를 섞는다(theme.md R9·R2 방식).
          style={{ color: 'color-mix(in srgb, var(--color-danger) 70%, var(--color-text))' }}
          className="text-sm"
        >
          {error}
        </p>
      )}
    </div>
  );
}
