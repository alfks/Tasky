'use client';

// 오늘의 기록 카드 (diary.md §2 — 카테고리쪽 사이드바, D-day 아래·도구 줄 위). `ShellSidebar` 가
// 마운트한다 — 컬럼이든 드로어든 한 번에 하나만 선다(diary 스토어가 전역 단일이라 둘이 같이 뜨면
// 같은 스토어를 놓고 싸운다).
import { useEffect, useRef, useState } from 'react';

import type { DateKey } from '@/domain/date/date-key';
import { findMoodEmoji } from '@/domain/diary/mood-emoji';

import { DiaryDialog } from '@/features/diary/components/DiaryDialog';
import { DiaryTitle } from '@/features/diary/components/DiaryTitle';
import { focusAfterDiaryRemoval } from '@/features/diary/lib/diary-focus';
import { DIARY_CARD_TITLE, diaryRemovalToastMessage } from '@/features/diary/lib/diary-messages';
import { useDiaryStore } from '@/features/diary/store/diary-store';

import { Button } from '@/components/ui/Button';
import { CARD_CLASS } from '@/components/ui/card-class';
import { IconButton } from '@/components/ui/IconButton';
import { Menu } from '@/components/ui/Menu';
import { Popover } from '@/components/ui/Popover';
import { Skeleton } from '@/components/ui/Skeleton';
import { pushToast } from '@/components/ui/Toast';

import { cn } from '@/lib/cn';

export const DIARY_EMPTY_TEXT = '오늘 하루 어땠나요?';
export const DIARY_ADD_LABEL = '+ 기록하기';
export const DIARY_EDIT_LABEL = '수정';
export const DIARY_MENU_LABEL = `${DIARY_CARD_TITLE} 메뉴`;
export const DIARY_DELETE_LABEL = '삭제';
/** 조회 자체가 실패했을 때(빈 상태와 구분, diary §2). `TodoList` 의 같은 문구 패턴. */
export const DIARY_LOAD_FAILED = '기록을 불러오지 못했어요';
/** `[되돌리기]` 를 눌렀는데 되돌릴 것이 없을 때(날짜를 옮긴 뒤 등, 리뷰 Minor 4). */
export const DIARY_UNDO_FAILED = '되돌릴 수 없어요';

type DiaryCardProps = {
  date: DateKey;
  /**
   * 카드 껍질(면·보더·그림자)을 스스로 그릴지. 기본 `true`. 이미 면을 가진 오버레이(드로어) 안에서는
   * `false` — 같은 면을 두 겹 겹치지 않는다(app-shell R18).
   */
  framed?: boolean;
  /**
   * 제목 아래 한 줄로 보일 날짜(`9월 17일 (목)`) — 호출부가 **선택 날짜가 오늘이 아닐 때만** 넘긴다
   * (오늘 판정의 출처는 스트립 스토어 하나, app-shell R12). 제목은 접근 이름 고정을 위해 그대로 둔다.
   */
  dateLabel?: string;
};

export function DiaryCard({ date, framed = true, dateLabel }: DiaryCardProps) {
  const entry = useDiaryStore((s) => s.entry);
  const status = useDiaryStore((s) => s.status);
  const error = useDiaryStore((s) => s.error);
  const load = useDiaryStore((s) => s.load);
  const remove = useDiaryStore((s) => s.remove);
  const undoRemove = useDiaryStore((s) => s.undoRemove);
  const clearPendingRemoval = useDiaryStore((s) => s.clearPendingRemoval);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // 스토어가 이미 그 날짜를 `ready` 로 들고 있으면 다시 읽지 않는다 — 사이드바 드로어를 여닫을
    // 때마다 이 카드가 마운트되므로(리뷰 Major 1·Nit 2), 매번 읽으면 6초 되돌리기 메모가 위험해지고
    // 스켈레톤 → 내용으로 높이가 튄다. 날짜가 바뀌면 `load` 가 새로 읽는다.
    const current = useDiaryStore.getState();
    if (current.date !== date || current.status !== 'ready') void load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // 저장 성공 직후 포커스는 [수정] 버튼으로 (diary §5).
  useEffect(() => {
    if (justSaved && entry !== undefined) {
      editRef.current?.focus();
      setJustSaved(false);
    }
  }, [justSaved, entry]);

  const handleSaved = (): void => {
    setDialogOpen(false);
    setJustSaved(true);
  };

  const handleRemove = (): void => {
    setMenuOpen(false);
    void remove().then((ok) => {
      if (!ok) return;
      pushToast({
        message: diaryRemovalToastMessage(),
        action: {
          label: '되돌리기',
          onAction: () =>
            void undoRemove().then((ok) => {
              if (!ok) pushToast({ message: DIARY_UNDO_FAILED });
            }),
        },
        onDismiss: clearPendingRemoval,
      });
      // `pushToast` 는 허브(구독 배열)만 갱신한다 — 토스트 뷰포트가 그 구독을 받아 실제로
      // `[되돌리기]` 버튼을 DOM 에 그리는 렌더는 **다음 마이크로태스크**에야 끝난다(`useSyncExternalStore`
      // 구독 알림 → React 커밋). 그래서 한 틱 미뤄서 찾는다 — `focus-fallback.ts` 의 `handoffFocus`가
      // "다음 프레임"을 기다리는 것과 같은 이유, 다만 여기서는 프레임이 아니라 마이크로태스크면 충분하다.
      queueMicrotask(() => focusAfterDiaryRemoval(addRef.current));
    });
  };

  return (
    <section
      aria-label={DIARY_CARD_TITLE}
      className={cn('flex flex-col', framed ? CARD_CLASS : null)}
    >
      {status === 'loading' ? (
        <Skeleton className="h-[72px] w-full" />
      ) : status === 'error' ? (
        // 조회 실패는 빈 상태와 다르다 — `TodoList` 의 같은 판단(§0-2 빈 상태와 에러 구분)을 그대로 쓴다.
        <p role="alert" className="text-sm text-muted">
          {error ?? DIARY_LOAD_FAILED}
        </p>
      ) : entry === undefined ? (
        <article className="flex flex-col items-start gap-[var(--space-3)]">
          <DiaryTitle dateLabel={dateLabel} />
          <p className="text-base text-text">{DIARY_EMPTY_TEXT}</p>
          <Button ref={addRef} onClick={() => setDialogOpen(true)}>
            {DIARY_ADD_LABEL}
          </Button>
        </article>
      ) : (
        <article className="flex flex-col gap-[var(--space-3)]">
          <div className="flex items-start justify-between gap-[var(--space-2)]">
            <DiaryTitle dateLabel={dateLabel} />
            <div className="flex shrink-0 items-center gap-[var(--space-1)]">
              <Button ref={editRef} variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>
                {DIARY_EDIT_LABEL}
              </Button>
              <IconButton
                ref={menuAnchor}
                label={DIARY_MENU_LABEL}
                onClick={() => setMenuOpen((open) => !open)}
              >
                ⋯
              </IconButton>
              <Popover
                open={menuOpen}
                onClose={() => setMenuOpen(false)}
                anchorRef={menuAnchor}
                hasPopup="menu"
                placement="bottom-end"
              >
                <Menu
                  label={DIARY_MENU_LABEL}
                  onClose={() => setMenuOpen(false)}
                  items={[
                    {
                      id: 'delete',
                      label: DIARY_DELETE_LABEL,
                      destructive: true,
                      onSelect: handleRemove,
                    },
                  ]}
                />
              </Popover>
            </div>
          </div>
          <p className="flex items-start gap-[var(--space-2)] text-base text-text">
            {entry.emoji === undefined ? null : (
              <>
                {/*
                  이모지 자체는 `aria-hidden`(그림 문자를 낭독기마다 다르게 읽는다, `EmojiPicker`
                  와 같은 처리) — 대신 `mood-emoji.ts` 의 `name` 을 sr-only 텍스트로 붙인다. 이게
                  없으면 **이모지만 있는 기록**은 낭독할 것이 아무것도 안 남는다(리뷰 Major, 실측:
                  "오늘의 기록수정" 뿐). routine.md §5 의 "텍스트 대체" 원칙과 같다.
                */}
                <span aria-hidden="true" className="text-lg leading-none">
                  {entry.emoji}
                </span>
                <span className="sr-only">{findMoodEmoji(entry.emoji)?.name ?? entry.emoji}</span>
              </>
            )}
            {entry.content === '' ? null : (
              <span className="min-w-0 break-words whitespace-pre-wrap">{entry.content}</span>
            )}
          </p>
        </article>
      )}

      <DiaryDialog
        open={dialogOpen}
        entry={entry}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
        returnFocus={() => (entry === undefined ? addRef.current : editRef.current)}
      />
    </section>
  );
}
