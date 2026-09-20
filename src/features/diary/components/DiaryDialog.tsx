'use client';

// 다이어리 작성/수정 다이얼로그 (diary.md §2·§5).
//
// Enter·Esc·포커스 트랩·IME 조합 규칙은 전부 `Dialog` 가 맡는다(app-shell R14) — 여기서 다시
// 구현하지 않는다. 단 `Enter` 제출은 **없다**(diary §5 — 텍스트 영역의 줄바꿈과 충돌한다). 저장은
// `[저장]` 클릭 또는 `Ctrl/⌘+Enter` 뿐이다.
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';

import type { DiaryEntry } from '@/domain/diary/diary-entry';
import {
  DIARY_CONTENT_MAX_LENGTH,
  diaryContentLength,
  normalizeDiaryContent,
} from '@/domain/diary/diary.rules';
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
   * 초기 포커스 (diary §5): 이모지 선택, 기존 값이 있으면 텍스트 영역. `Dialog` 가 이미
   * `initialFocusRef` 를 제공하므로(리뷰 Minor 2) 여기서 직접 `.focus()` 를 부르지 않는다 —
   * 직접 부르면 `Dialog` 가 먼저 기본값(첫 포커스 가능 요소, 보통 ✕ 버튼)으로 포커스를 잡은 뒤
   * 이 효과가 다시 옮기는 "잠깐 ✕ 에 머무는" 중간 상태가 생긴다. getter 를 쓰는 이유는 대상이
   * `entry` 유무에 따라 갈리고, 이모지 선택은 DOM 을 뒤져야만 첫 라디오를 찾을 수 있어서다 —
   * `Dialog` 는 열릴 때 이 `.current` 를 한 번만 읽으므로 매 렌더 평가돼도 비용이 없다.
   */
  const initialFocusRef: RefObject<HTMLElement | null> = {
    get current() {
      if (entry !== undefined) return textareaRef.current;
      return emojiGroupRef.current?.querySelector<HTMLElement>('[role="radio"]') ?? null;
    },
    // Dialog 는 읽기만 한다 — 쓰기는 라이브러리 타입(`current: T`, 비-readonly) 을 맞추기 위한
    // 무-연산이다.
    set current(_value: HTMLElement | null) {},
  };

  const normalizedContent = normalizeDiaryContent(content);
  const isEmpty = emoji === '' && normalizedContent === '';
  const contentLength = diaryContentLength(content);
  const remaining = DIARY_CONTENT_MAX_LENGTH - contentLength;

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
      initialFocusRef={initialFocusRef}
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
            // 본문은 grapheme 으로 검증한다(`diary.rules.ts#diaryContentLength` — 카테고리 이름과
            // 같은 이유, 리뷰 Minor 1). 브라우저 `maxLength` 는 UTF-16 코드 유닛만 세므로 이모지처럼
            // 서러게이트 쌍(그래핌 1개 = 코드 유닛 2개)이 섞이면 실제로 500 그래핌을 다 못 칠 수
            // 있다 — 그래서 카테고리 이름(`CATEGORY_NAME_MAX_LENGTH * 2`)과 같은 배율로 여유를 두고
            // 진짜 상한은 `validateDiaryContent`(제출 시)가 그래핌 수로 막는다.
            maxLength={DIARY_CONTENT_MAX_LENGTH * 2}
            rows={4}
            className="w-full resize-none rounded-[var(--radius-md)] border border-border bg-surface p-[var(--space-3)] text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
        </label>

        {/*
          시각 표시(왼쪽 항상 보임)와 낭독(`aria-live`)을 **분리**한다 — 같은 요소에 합치면 매
          입력마다 이 영역의 텍스트가 바뀌어 매번 낭독된다(diary §5 "매 입력마다 아님" 위반).
          `aria-live` 영역은 490자에 이르기 전까지 빈 문자열이다. 490자를 넘어서도 **10자 단위**로만
          채운다(490·480·…·10·0 자 남음) — 매 글자(490→500, 11회)가 아니라 490자부터 열 번 남짓만
          낭독하게 줄인 것(리뷰 Nit, diary §5 문면은 "490자부터" 만 못박고 빈도는 정하지 않는다).
          경계(0자, 초과)는 항상 낭독한다 — 저장 가능 여부가 갈리는 지점이라 10 배수가 아니어도 알려야 한다.
        */}
        <div className="flex items-center justify-end gap-[var(--space-2)] text-sm text-muted">
          <span aria-hidden="true">
            {contentLength} / {DIARY_CONTENT_MAX_LENGTH}
          </span>
          <span aria-live="polite" className="sr-only">
            {contentLength >= CHAR_WARNING_THRESHOLD && (remaining <= 0 || remaining % 10 === 0)
              ? `${Math.max(remaining, 0)}자 남음`
              : ''}
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
