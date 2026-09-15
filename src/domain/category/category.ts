// 카테고리 엔티티 타입 (docs/ARCHITECTURE.md §4).
import type { Meta } from '@/domain/meta';

/** 색상을 가진 투두 묶음 (예: 공부, 운동). */
export type Category = Meta & {
  /** 사용자가 입력한 이름. */
  name: string;
  /** 사용자 지정 색상(CSS 색 문자열). 정보 전달은 텍스트가 병행한다. */
  color: string;
  /** 이름 앞에 붙는 선택적 이모지. */
  emoji?: string;
  /** 카테고리 목록에서의 표시 순서. */
  order: number;
};
