'use client';

// "프로필 편집" 대화상자 (profile.md §2·§5) — ✎ 로만 열리는 지연 청크(R11). 포커스 트랩·Esc·✕·닫힌 뒤
// ✎ 로의 복귀는 `Dialog` 가 맡는다(app-shell 표준). 초기 포커스는 이름 칸. `Enter` 는 이름·소개 칸에서
// 저장(한 줄 입력이라 충돌 없음 — 조합 중 Enter 는 `Dialog` 가 문서 캡처 단계에서 삼킨다, R14).
// **`maxLength` 를 쓰지 않는다**(UTF-16 단위라 R1 의 코드 포인트 셈법과 이모지에서 어긋난다) — 초과는
// 제출 시 문구로 알린다(todo.md 제목과 같은 방식). 취소·Esc·✕ 는 미리보기 포함 전부 버린다.
import { useId, useRef } from 'react';

import { PROFILE_BIO_MAX_LENGTH, PROFILE_NAME_MAX_LENGTH } from '@/domain/profile/profile.rules';
import {
  profileCharCount,
  profileDisplayName,
  profileInitial,
} from '@/domain/profile/profile.rules';

import { ProfilePhotoField } from '@/features/profile/components/ProfilePhotoField';
import { useProfileForm, type ProfileFormDeps } from '@/features/profile/hooks/useProfileForm';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

import { cn } from '@/lib/cn';

export const PROFILE_DIALOG_TITLE = '프로필 편집';

const INPUT_CLASS =
  'h-[var(--control-height)] w-full rounded-[var(--radius-md)] border border-border bg-surface px-[var(--space-3)] text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';
const ERROR_STYLE = { color: 'color-mix(in srgb, var(--color-danger) 70%, var(--color-text))' };

type ProfileDialogProps = ProfileFormDeps & {
  /** 로그인 이메일 — 미리보기 원의 첫 글자 폴백(R10)에 쓴다. */
  email: string | null;
  /** 닫아야 할 때(Esc·✕·바깥 클릭·취소·저장 성공). 열고 닫는 것은 카드가 한다. */
  onClose: () => void;
  /** 저장소 실패 — 카드가 토스트를 띄운다(§2 문구). 검증 오류는 칸 아래 문구가 맡는다. */
  onSaveFailed: () => void;
};

type TextFieldProps = {
  label: string;
  value: string;
  max: number;
  error: string | null;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onEnter: () => void;
};

/** 이름·소개 한 칸 — 라벨 + 입력 + `n / max`(시각 보조만, `aria-live` 없음) + 제출 시 오류. */
function TextField({ label, value, max, error, inputRef, onChange, onEnter }: TextFieldProps) {
  const errorId = useId();
  const count = profileCharCount(value);
  return (
    <div className="flex flex-col gap-[var(--space-1)]">
      <label className="flex flex-col gap-[var(--space-1)] text-sm text-muted">
        {label}
        <input
          ref={inputRef}
          value={value}
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={error === null ? undefined : true}
          aria-describedby={error === null ? undefined : errorId}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onEnter();
            }
          }}
          className={INPUT_CLASS}
        />
      </label>
      <div className="flex items-baseline justify-between gap-[var(--space-2)]">
        {error === null ? (
          <span />
        ) : (
          <p id={errorId} role="alert" style={ERROR_STYLE} className="text-sm">
            {error}
          </p>
        )}
        <span
          aria-hidden="true"
          className={cn('text-xs tabular-nums', count > max ? 'text-danger' : 'text-muted')}
        >
          {count} / {max}
        </span>
      </div>
    </div>
  );
}

export function ProfileDialog({
  email,
  initial,
  save: saveToStore,
  deps,
  onClose,
  onSaveFailed,
}: ProfileDialogProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const form = useProfileForm({ initial, save: saveToStore, deps });

  const save = async (): Promise<void> => {
    // 사진을 읽는 동안 저장하면 이전 사진으로 저장하고 닫혀 고른 사진이 조용히 버려진다(리뷰 B-m2).
    if (form.saving || form.reading) return;
    const result = await form.submit();
    if (result === 'saved') onClose();
    else if (result === 'failed') onSaveFailed();
  };

  const previewInitial = profileInitial(profileDisplayName(form.name, email));

  return (
    <Dialog
      open
      onClose={onClose}
      title={PROFILE_DIALOG_TITLE}
      initialFocusRef={nameRef}
      className="max-w-[400px]"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void save()} loading={form.saving} disabled={form.reading}>
            저장
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[var(--space-4)]">
        <ProfilePhotoField
          avatar={form.avatar}
          initial={previewInitial}
          error={form.photoError}
          busy={form.reading}
          onPick={(file) => void form.pickPhoto(file)}
          onClear={form.clearPhoto}
        />
        <TextField
          label="이름"
          value={form.name}
          max={PROFILE_NAME_MAX_LENGTH}
          error={form.nameError}
          inputRef={nameRef}
          onChange={form.setName}
          onEnter={() => void save()}
        />
        <TextField
          label="한 줄 소개"
          value={form.bio}
          max={PROFILE_BIO_MAX_LENGTH}
          error={form.bioError}
          onChange={form.setBio}
          onEnter={() => void save()}
        />
      </div>
    </Dialog>
  );
}
