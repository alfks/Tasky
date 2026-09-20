'use client';

// 다이어리 작성/수정 다이얼로그 (diary.md §2·§5).
//
// Enter·Esc·포커스 트랩·IME 조합 규칙은 전부 `Dialog` 가 맡는다(app-shell R14) — 여기서 다시
// 구현하지 않는다. 단 `Enter` 제출은 **없다**(diary §5 — 텍스트 영역의 줄바꿈과 충돌한다). 저장은
// `[저장]` 클릭 또는 `Ctrl/⌘+Enter` 뿐이다.
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { DiaryEntry } from '@/domain/diary/diary-entry';
import { DIARY_CONTENT_MAX_LENGTH, normalizeDiaryContent } from '@/domain/diary/diary.rules';
import { MOOD_EMOJIS } from '@/domain/diary/mood-emoji';

import { useDiaryStore } from '@/features/diary/store/diary-store';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmojiPicker } from '@/components/ui/EmojiPicker';

/** 490자부터 남은 수를 안내한다(diary §5) — 매 입력마다가 아니라 한계 가까이에서만. */
const CHAR_WARNING_THRESHOLD = 490;

type DiaryDialogProps = {
  /** 열림 여부. */
  open: boolean;
  /** 수정 대상. `undefined` 면 새로 쓰는 것이다. */
  entry: DiaryEntry | undefined;
  /** Esc·✕·바깥 클릭·취소로 닫으려 할 때. */
  onClose: () => void;
  /** 저장이 성공했을 때(닫는 것은 호출자 몫). */
  onSaved: () => void;
  /** 연 요소가 사라졌을 때의 대체 포커스 대상 (app-shell R14). */
  returnFocus?: () => HTMLElement | null;
};

export function DiaryDialog({ open, entry, onClose, onSaved, returnFocus }: DiaryDialogProps) {
  const save = useDiaryStore((s) => s.save);
  const error = useDiaryStore((s) => s.error);
  const clearError = useDiaryStore((s) => s.clearError);

  const [emoji, setEmoji] = useState(entry?.emoji ?? '');
  const [content, setContent] = useState(entry?.content ?? '');
  const [saving, setSaving] = useState(false);
  const emojiGroupRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 열릴 때마다 폼을 그 시점의 값으로 되돌린다 — 저장하지 않고 닫았다가 다시 열어도 지난 입력이 남지 않는다.
  useEffect(() => {
    if (!open) return;
    setEmoji(entry?.emoji ?? '');
    setContent(entry?.content ?? '');
    clearError();
  }, [open, entry, clearError]);

  /**
   * 초기 포커스 (diary §5): 이모지 선택, 기존 값이 있으면 텍스트 영역. `Dialog` 는 `children` 안에서
   * 첫 포커스 가능 요소(✕ 버튼)로 기본 포커스를 잡으므로, **그 뒤에** 여기서 원하는 자리로 덮어쓴다
   * (이 컴포넌트가 `Dialog` 의 부모라 효과가 나중에 돈다 — React 는 자식 효과부터 커밋한다).
   */
  useEffect(() => {
    if (!open) return;
    if (entry !== undefined) {
      textareaRef.current?.focus();
    } else {
      emojiGroupRef.current?.querySelector<HTMLElement>('[role="radio"]')?.focus();
    }
  }, [open, entry]);

  const normalizedContent = normalizeDiaryContent(content);
  const isEmpty = emoji === '' && normalizedContent === '';
  const remaining = DIARY_CONTENT_MAX_LENGTH - content.length;

  const submit = async (): Promise<void> => {
    if (isEmpty || saving) return;
    setSaving(true);
    const ok = await save({ emoji: emoji === '' ? undefined : emoji, content });
    setSaving(false);
    if (ok) {
      onSaved();
    }
  };

  const handleTextareaKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={entry === undefined ? '오늘의 기록' : '기록 수정'}
      returnFocus={returnFocus}
      className="max-w-[400px]"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void submit()} disabled={isEmpty} loading={saving}>
            저장
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[var(--space-4)]">
        <div className="flex flex-col gap-[var(--space-2)]">
          <span className="text-sm text-muted">기분</span>
          <div ref={emojiGroupRef}>
            <EmojiPicker label="기분" options={MOOD_EMOJIS} value={emoji} onChange={setEmoji} />
          </div>
        </div>

        <label className="flex flex-col gap-[var(--space-1)] text-sm text-muted">
          오늘 하루
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            // 본문은 grapheme 이 아니라 문자 길이(`.length`)로 검증한다(`diary.rules.ts` — 카테고리
            // 이름과 달리 grapheme 여유(`* 2`)가 필요 없다). 그래서 여기 값이 도메인 상한과 정확히 같다.
            maxLength={DIARY_CONTENT_MAX_LENGTH}
            rows={4}
            className="w-full resize-none rounded-[var(--radius-md)] border border-border bg-surface p-[var(--space-3)] text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
        </label>

        {/*
          시각 표시(왼쪽 항상 보임)와 낭독(`aria-live`)을 **분리**한다 — 같은 요소에 합치면 매
          입력마다 이 영역의 텍스트가 바뀌어 매번 낭독된다(diary §5 "매 입력마다 아님" 위반).
          `aria-live` 영역은 490자에 이르기 전까지 빈 문자열로 두어 낭독을 만들지 않다가, 490자부터
          내용이 채워지면서 그 뒤로는 한 글자 늘 때마다 "몇 자 남음"을 새로 낭독한다.
        */}
        <div className="flex items-center justify-end gap-[var(--space-2)] text-sm text-muted">
          <span aria-hidden="true">
            {content.length} / {DIARY_CONTENT_MAX_LENGTH}
          </span>
          <span aria-live="polite" className="sr-only">
            {content.length >= CHAR_WARNING_THRESHOLD ? `${Math.max(remaining, 0)}자 남음` : ''}
          </span>
        </div>

        {error === null ? null : (
          <p
            role="alert"
            style={{ color: 'color-mix(in srgb, var(--color-danger) 70%, var(--color-text))' }}
          >
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
