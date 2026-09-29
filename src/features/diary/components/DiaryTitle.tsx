// 오늘의 기록 카드의 제목 줄 (diary.md §2) — `DiaryCard` 의 빈 상태·작성됨 두 갈래가 함께 쓴다.
import { DIARY_CARD_TITLE } from '@/features/diary/lib/diary-messages';

type DiaryTitleProps = {
  /** 선택 날짜가 오늘이 아닐 때만 제목 아래 muted 로 붙는 한 줄(`9월 17일 (목)`). */
  dateLabel?: string;
};

/** 제목 글자는 옆 카드(D-day)의 `h2` 와 같은 값이다 — 한 컬럼 안에서 제목의 언어를 맞춘다. */
export function DiaryTitle({ dateLabel }: DiaryTitleProps) {
  return (
    <div className="min-w-0">
      <h2 className="text-md font-semibold text-text">{DIARY_CARD_TITLE}</h2>
      {dateLabel === undefined ? null : <p className="text-xs text-muted">{dateLabel}</p>}
    </div>
  );
}
