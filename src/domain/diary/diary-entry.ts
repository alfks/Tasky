// 다이어리 엔티티 타입 (diary.md §4). 카테고리·투두와 연결되지 않는 독립 기록이다 — 날짜당
// 삭제되지 않은 것 기준 최대 1개(R1, 유일성은 도메인 `createDiaryEntry`가 지킨다).
import type { DateKey } from '@/domain/date/date-key';
import type { Meta } from '@/domain/meta';

/** 하루를 마치며 남기는 기분 이모지 + 짧은 글 (diary.md §1). */
export type DiaryEntry = Meta & {
  /** 이 기록이 속한 날짜. */
  date: DateKey;
  /** 제공 목록(`mood-emoji.ts`)의 값. "없음"은 필드 자체가 없다(R3). */
  emoji?: string;
  /** 0~500자. 공백만이면 저장 전에 ''로 정규화된다(R2). `emoji`와 둘 다 비면 저장 불가(R3). */
  content: string;
};
