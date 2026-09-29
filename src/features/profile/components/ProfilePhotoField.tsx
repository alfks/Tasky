// 편집 대화상자의 사진 줄 (profile.md §2·§5). 파일 선택은 **진짜 `input[type=file]`** 을 `sr-only` 로
// 시각만 숨기고 포커스 가능하게 둔다(`display:none` 금지 — Tab 으로 닿아야 한다). 버튼 모양의
// `label htmlFor` 가 input 의 `:focus-visible` 링을 자기 위에 그린다(`peer-focus-visible`, Checkbox 와
// 같은 방식). 오류 `role=alert` 의 id 는 **input 의 `aria-describedby`** 에 둔다 — 포커스가 input 에
// 있으므로 거기서 낭독된다(backup 의 파일 선택과 같은 구조).
import { useId } from 'react';

import { ProfileAvatar } from '@/features/profile/components/ProfileAvatar';

import { Button } from '@/components/ui/Button';

import { cn } from '@/lib/cn';

export const PHOTO_PICK_LABEL = '사진 고르기';
export const PHOTO_CLEAR_LABEL = '사진 지우기';
export const PHOTO_READING_TEXT = '사진을 읽는 중…';

type ProfilePhotoFieldProps = {
  avatar: string | undefined;
  /** 사진이 없을 때 미리보기 원에 넣을 첫 글자. */
  initial: string;
  error: string | null;
  /** 파일을 읽는 동안 — 고르기·지우기를 잠근다(중복 선택 방지). */
  busy: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
};

export function ProfilePhotoField({
  avatar,
  initial,
  error,
  busy,
  onPick,
  onClear,
}: ProfilePhotoFieldProps) {
  const inputId = useId();
  const errorId = useId();

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <div className="flex items-center gap-[var(--space-4)]">
        {/* 읽는 동안(큰 사진은 1~2초) 미리보기를 흐리고 아래 한 줄로 알린다 — "눌렀는데 아무 일도 없다" 방지. */}
        <span
          aria-busy={busy || undefined}
          className={cn('inline-flex', busy ? 'opacity-50' : null)}
        >
          <ProfileAvatar avatar={avatar} initial={initial} size={64} />
        </span>
        <div className="flex flex-wrap items-center gap-[var(--space-2)]">
          <input
            id={inputId}
            type="file"
            accept="image/*"
            disabled={busy}
            aria-describedby={error === null ? undefined : errorId}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // 같은 파일을 다시 골라도 change 가 나게 값을 비운다.
              event.target.value = '';
              if (file !== undefined) onPick(file);
            }}
            className="peer sr-only"
          />
          <label
            htmlFor={inputId}
            className={cn(
              // `Button` outline/sm 과 같은 꼴 — label 은 button 요소가 아니라 그 컴포넌트를 못 쓴다.
              'inline-flex h-[var(--control-hit-min)] cursor-pointer items-center rounded-[var(--radius-md)] border border-border bg-surface px-[var(--space-3)] text-base font-semibold whitespace-nowrap text-text hover:bg-surface-2',
              'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
              'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
            )}
          >
            {PHOTO_PICK_LABEL}
          </label>
          {avatar === undefined ? null : (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onClear}>
              {PHOTO_CLEAR_LABEL}
            </Button>
          )}
        </div>
      </div>
      {busy && error === null ? <p className="text-sm text-muted">{PHOTO_READING_TEXT}</p> : null}
      {error === null ? null : (
        <p
          id={errorId}
          role="alert"
          // 위험 색 글자는 본문 대비 4.5:1 에 못 미치므로 --color-text 를 섞는다(theme.md R9, CategoryFormDialog 와 같다).
          style={{ color: 'color-mix(in srgb, var(--color-danger) 70%, var(--color-text))' }}
          className="text-sm"
        >
          {error}
        </p>
      )}
    </div>
  );
}
