// D-day 엔티티 타입 (calendar.md §4). 카테고리·투두와 연결되지 않는 독립 이벤트다(calendar R4).
import type { DateKey } from '@/domain/date/date-key';
import type { Meta } from '@/domain/meta';

/** 미리 정해 둔 날짜(생일·발표일 등)까지 며칠 남았는지 보여주는 독립 이벤트. 반복 없음(calendar R4). */
export type Dday = Meta & {
  /** 사용자가 입력한 제목. 앞뒤 공백 제거 후 1~30자 (calendar R1). */
  title: string;
  /** 기준 날짜. 과거·미래 모두 허용한다 (calendar R1). */
  date: DateKey;
};
